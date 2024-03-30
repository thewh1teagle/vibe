/// Formats an error message with additional context, including file and line information.
#[macro_export]
macro_rules! pretty_error {
    ($e:expr) => {
        format!("Error in {} at line {}: {:?}", file!(), line!(), $e)
    };
    ($e:expr, $context:expr) => {
        format!("Error in {} at line {}: {}:\n{:?}", file!(), line!(), $context, $e)
    };
}