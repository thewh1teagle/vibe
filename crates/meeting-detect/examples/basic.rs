use std::time::Duration;

fn main() {
    println!("{}", serde_json::to_string(&meeting_detect::detect()).unwrap());
    for state in meeting_detect::watch(Duration::from_secs(2)) {
        println!("{}", serde_json::to_string(&state).unwrap());
    }
}
