extern crate engine;

use engine::selection_box::*;

fn test_selection_box_diff(
    origin_x: usize,
    origin_y: usize,
    box1: &SelectionRegion,
    box2: &SelectionRegion,
    expected_changed_region_1: &ChangedRegion,
    expected_changed_region_2: &ChangedRegion,
) {
    // TODO: check retained regions as well
    let (_, region_1, region_2) = box1.diff(origin_x, origin_y, &box2);
    assert_eq!(region_1, *expected_changed_region_1);
    assert_eq!(region_2, *expected_changed_region_2);
}

#[test]
fn selection_box_diff_disjoint() {
    let original_box = SelectionRegion {
        x: 10,
        y: 10,
        width: 10,
        height: 10,
    };
    let new_box = SelectionRegion {
        x: 0,
        y: 10,
        width: 10,
        height: 10,
    };

    test_selection_box_diff(
        10,
        10,
        &original_box,
        &new_box,
        &ChangedRegion {
            was_added: true,
            region: new_box.clone(),
        },
        &ChangedRegion {
            was_added: false,
            region: original_box.clone(),
        },
    );
}

#[test]
fn selection_box_diff_intersecting_1() {
    let original_box = SelectionRegion {
        x: 0,
        y: 0,
        width: 2,
        height: 2,
    };
    let new_box = SelectionRegion {
        x: 0,
        y: 0,
        width: 3,
        height: 1,
    };

    test_selection_box_diff(
        2,
        0,
        &original_box,
        &new_box,
        &ChangedRegion {
            was_added: true,
            region: SelectionRegion {
                x: 2,
                y: 0,
                width: 1,
                height: 1,
            },
        },
        &ChangedRegion {
            was_added: false,
            region: SelectionRegion {
                x: 0,
                y: 1,
                width: 2,
                height: 1,
            },
        },
    );
}

#[test]
fn selection_box_diff_intersecting_2() {
    let original_box = SelectionRegion {
        x: 3,
        y: 3,
        width: 2,
        height: 2,
    };
    let new_box = SelectionRegion {
        x: 2,
        y: 3,
        width: 3,
        height: 1,
    };

    test_selection_box_diff(
        5,
        3,
        &original_box,
        &new_box,
        &ChangedRegion {
            was_added: true,
            region: SelectionRegion {
                x: 2,
                y: 3,
                width: 1,
                height: 1,
            },
        },
        &ChangedRegion {
            was_added: false,
            region: SelectionRegion {
                x: 3,
                y: 4,
                width: 2,
                height: 1,
            },
        },
    );
}

#[test]
fn selection_box_diff_both_grow_shrink() {
    let original_box = SelectionRegion {
        x: 0,
        y: 0,
        width: 2,
        height: 2,
    };
    let new_box = SelectionRegion {
        x: 0,
        y: 0,
        width: 3,
        height: 3,
    };
    let mut change_1 = ChangedRegion {
        was_added: true,
        region: SelectionRegion {
            x: 2,
            y: 0,
            width: 1,
            height: 3,
        },
    };
    let mut change_2 = ChangedRegion {
        was_added: true,
        region: SelectionRegion {
            x: 0,
            y: 2,
            width: 2,
            height: 1,
        },
    };

    // grow
    test_selection_box_diff(0, 0, &original_box, &new_box, &change_1, &change_2);

    // shrink
    change_1.was_added = false;
    change_2.was_added = false;
    test_selection_box_diff(0, 0, &new_box, &original_box, &change_1, &change_2);
}

#[test]
fn selection_region_from_mouse_coords() {
    let check_region = |x1: usize,
                        y1: usize,
                        x2: usize,
                        y2: usize,
                        x: usize,
                        y: usize,
                        width: usize,
                        height: usize| {
        assert_eq!(
            SelectionRegion::from_points(x1, y1, x2, y2),
            SelectionRegion {
                x,
                y,
                width,
                height
            }
        );
    };

    check_region(10, 10, 20, 20, 10, 10, 10, 10);
    check_region(10, 10, 0, 0, 0, 0, 10, 10);
    check_region(10, 10, 10, 0, 10, 0, 0, 10);
    check_region(0, 0, 0, 0, 0, 0, 0, 0);
    check_region(10, 10, 20, 0, 10, 0, 10, 10);
}
