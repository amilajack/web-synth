import * as R from 'ramda';
import { Option } from 'funfix-core';
import { UnreachableException } from 'ameo-utils';

import { SequencerReduxState, VoiceTarget } from 'src/sequencer/redux';
import { getBeatTimings } from 'src/sequencer/sequencer';

const ctx = new AudioContext();

export type SchedulerHandle = number;

const RESCHEDULE_INTERVAL_MS = 3200;

interface SchedulerState {
  /**
   * Samples that have been scheduled to be played.  We hold onto them until the next scheduler
   * quantum in case they need to be canceled due to the sequencer being stopped.
   */
  scheduledBuffers: { time: number; node: AudioBufferSourceNode }[];
}

type BeatSchedulerBuilder<K extends string> = (
  state: SequencerReduxState,
  schedulerState: SchedulerState,
  voice: Extract<VoiceTarget, { type: K }>
) => (time: number) => void;

const BeatSchedulersBuilderByVoiceType: { [K in VoiceTarget['type']]: BeatSchedulerBuilder<K> } = {
  midi: (
    state: SequencerReduxState,
    _schedulerState: SchedulerState,
    voice: Extract<VoiceTarget, { type: 'midi' }>
  ) => {
    if (R.isNil(voice.synthIx)) {
      return R.identity;
    }

    const midiOutput = state.midiOutputs[voice.synthIx!];
    if (!midiOutput) {
      throw new Error(`No MIDI output at index ${voice.synthIx} found in sequencer state`);
    }

    return (beat: number) => {
      midiOutput.outputCbs.forEach(({ onAttack, onRelease }) => {
        const curTime = ctx.currentTime;
        // TODO: Make per-voice config of what percentage of the window to hold the note for
        const beatDurationMS = (state.bpm * 1000) / 60;
        const holdDurationMS = beatDurationMS * 0.72;

        // TODO: Use a polyphonic voice manager here somewhere?
        onAttack(voice.note, 0, 255, beat - curTime);
        onRelease(voice.note, 0, 255, beat + holdDurationMS / 1000 - curTime);
      });
    };
  },
  sample: (
    state: SequencerReduxState,
    schedulerState: SchedulerState,
    voice: Extract<VoiceTarget, { type: 'sample' }>
  ) => {
    if (R.isNil(voice.sampleIx)) {
      return R.identity;
    }

    const buffer = state.sampleBank[voice.sampleIx!].buffer;

    return (time: number) => {
      const node = new AudioBufferSourceNode(ctx, { buffer });
      node.start(time);
      schedulerState.scheduledBuffers.push({ time, node });
      node.connect(state.outputGainNode);
    };
  },
  gate: (
    state: SequencerReduxState,
    _schedulerState: SchedulerState,
    voice: Extract<VoiceTarget, { type: 'gate' }>
  ) => {
    if (R.isNil(voice.gateIx)) {
      return R.identity;
    }

    if (voice.gateIx === 'RISING_EDGE_DETECTOR') {
      return (time: number) => {
        if (!state.risingEdgeDetector) {
          return;
        }

        const param = (state.risingEdgeDetector.parameters as Map<string, AudioParam>).get(
          'input'
        )!;

        param.setValueAtTime(time, 1.0);
        param.setValueAtTime(time + 1 / (1000 * 10), 0.0);
      };
    }

    return (time: number) => {
      const dstGate = state.gateOutputs[voice.gateIx! as number];
      if (!dstGate) {
        throw new Error(`No gate ix ${voice.gateIx} in state, but voice has it`);
      }

      // TODO: Make the duration of the beat that the gate is activated for configurable
      const beatDurationMS = (state.bpm * 1000) / 60;
      const holdDurationMS = beatDurationMS * 0.72;

      dstGate.offset.setValueAtTime(time, 1.0);
      dstGate.offset.setValueAtTime(time + holdDurationMS / 1000, 0.0);
    };
  },
};

const mkBeatScheduler = (
  state: SequencerReduxState,
  schedulerState: SchedulerState,
  voice: VoiceTarget
) => BeatSchedulersBuilderByVoiceType[voice.type](state, schedulerState, voice as any);

const SchedulerStateMap: Map<SchedulerHandle, SchedulerState> = new Map();

export const initScheduler = (state: SequencerReduxState): SchedulerHandle => {
  let endOfLastSchedulingWindow = ctx.currentTime;
  let lastScheduledBeatIndex = -1;

  const schedulerState: SchedulerState = {
    scheduledBuffers: [],
  };

  const handle = setInterval(() => {
    const curTime = ctx.currentTime;
    const startOfCurSchedWindow = Math.max(curTime, endOfLastSchedulingWindow);
    const endOfCurSchedWindow = ctx.currentTime + (RESCHEDULE_INTERVAL_MS / 1000) * 3;
    endOfLastSchedulingWindow = endOfCurSchedWindow;

    // Drop references to all samples that have already been started
    schedulerState.scheduledBuffers = schedulerState.scheduledBuffers.filter(
      ({ time }) => time > curTime
    );

    const beatCountEstimate = Math.max(((RESCHEDULE_INTERVAL_MS / 1000) * 60) / state.bpm, 1);
    let beatTimings = getBeatTimings(
      state.schedulerScheme,
      state.bpm,
      lastScheduledBeatIndex + 1,
      lastScheduledBeatIndex + beatCountEstimate + 1
    );

    // make sure that we have timings for all necessary beats
    while (R.last(beatTimings)! < endOfCurSchedWindow) {
      beatTimings = [
        ...beatTimings,
        ...getBeatTimings(
          state.schedulerScheme,
          state.bpm,
          lastScheduledBeatIndex + 1 + beatTimings.length,
          lastScheduledBeatIndex + beatCountEstimate + 1 + beatTimings.length
        ),
      ];
    }

    beatTimings = beatTimings.filter(
      beat => beat > startOfCurSchedWindow && beat < endOfCurSchedWindow
    );
    lastScheduledBeatIndex = lastScheduledBeatIndex + beatTimings.length;
    console.log('Scheduling beats: ', beatTimings);

    state.voices.forEach(voice =>
      beatTimings.forEach(mkBeatScheduler(state, schedulerState, voice))
    );

    // Schedule the beats on the rising edge detector
    beatTimings.forEach(
      mkBeatScheduler(state, schedulerState, { type: 'gate', gateIx: 'RISING_EDGE_DETECTOR' })
    );
  }, RESCHEDULE_INTERVAL_MS);

  console.log('Setting state for handle: ', handle);
  SchedulerStateMap.set(handle, schedulerState);
  return handle;
};

export const stopScheduler = (handle: SchedulerHandle, state: SequencerReduxState) => {
  const schedulerState = SchedulerStateMap.get(handle);
  if (!schedulerState) {
    throw new UnreachableException(
      `No entry in scheduler state map for handle ${handle} when stopping scheduler`
    );
  }
  SchedulerStateMap.delete(handle);

  // Cancel all pending samples
  schedulerState.scheduledBuffers.forEach(({ node }) => node.stop());

  // Cancel all pending MIDI events
  state.voices
    .filter(voice => voice.type === 'midi')
    .forEach(midiVoice => {
      const synthIx = (midiVoice as Extract<VoiceTarget, { type: 'midi' }>).synthIx;
      if (!R.isNil(synthIx)) {
        state.midiOutputs[synthIx!].outputCbs.forEach(({ onClearAll }) => onClearAll());
      }
    });

  // Cancel all events on the rising edge detector
  const valueParam = (state.risingEdgeDetector?.parameters as Map<string, AudioParam>).get('value');
  if (valueParam) {
    valueParam.cancelScheduledValues(0);
    valueParam.setValueAtTime(0, ctx.currentTime);
  }

  clearInterval(handle);
};