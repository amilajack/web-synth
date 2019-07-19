pub mod manager;
pub use self::manager::ViewContextManager;

pub trait ViewContext {
    /// Set up the view context to be the primary/active view of the application.  This may involve
    /// things like subscribing to/loading external data sources, creating DOM nodes, etc.
    fn init(&mut self) {}

    /// Clean up any external resources such as DOM elements that were created by the view context,
    /// making the application ready for the creation of a new one.  This does not mean that the
    /// `ViewContext` is being deleted, merely that it is being "un-rendered."
    fn cleanup(&mut self) {}

    /// This function is called before a `ViewContext` is permanently deleted, meaning that it will
    /// never again be rendered and should dispose of all attached resources and storage.
    fn dispose(&mut self) {}

    /// This is called to indicate that a `ViewContext` should serialize itself into a persistant
    /// format that can be called later to re-create it in its current state from scratch.
    ///
    /// This serialized format should include all settings, configuration, and UI state for the
    /// view context, but it shouldn't include the VC's *data* directly, where data is things like
    /// the content of a text editor or the notes on a grid.  That data should be stored separately
    /// and referenced by a `localStorage` key or something similar.  The reason for this is that
    /// these definitions are created, read, and transferred between WebAssembly and JavaScript
    /// regularly, and storing large data in them will cause that to become slow.
    fn save(&mut self) -> String;

    // input handlers
    fn handle_key_down(&mut self, _key: &str, _control_pressed: bool, _shift_pressed: bool) {}
    fn handle_key_up(&mut self, _key: &str, _control_pressed: bool, _shift_pressed: bool) {}
    fn handle_mouse_down(&mut self, _x: usize, _y: usize) {}
    fn handle_mouse_move(&mut self, _x: usize, _y: usize) {}
    fn handle_mouse_up(&mut self, _x: usize, _y: usize) {}
    fn handle_mouse_wheel(&mut self, _ydiff: isize) {}

    fn handle_message(&mut self, _key: &str, _val: &str) -> Option<Vec<u8>> { None }
}
