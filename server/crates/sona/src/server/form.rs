use std::collections::HashMap;

pub(super) struct FormValues<'a> {
    values: &'a HashMap<String, String>,
}

impl<'a> FormValues<'a> {
    pub fn new(values: &'a HashMap<String, String>) -> Self {
        Self { values }
    }

    pub fn bool(&self, name: &str) -> bool {
        matches!(
            self.values.get(name).map(String::as_str),
            Some("1" | "t" | "T" | "true" | "TRUE" | "True" | "yes" | "on")
        )
    }

    pub fn i32(&self, name: &str) -> i32 {
        self.values
            .get(name)
            .and_then(|value| value.parse().ok())
            .unwrap_or(0)
    }

    pub fn f32(&self, name: &str) -> f32 {
        self.values
            .get(name)
            .and_then(|value| value.parse().ok())
            .unwrap_or(0.0)
    }

    pub fn string(&self, name: &str) -> Option<String> {
        self.values
            .get(name)
            .filter(|value| !value.is_empty())
            .cloned()
    }

    pub fn str_or<'b>(&'b self, name: &str, default: &'b str) -> &'b str {
        self.values.get(name).map(String::as_str).unwrap_or(default)
    }
}
