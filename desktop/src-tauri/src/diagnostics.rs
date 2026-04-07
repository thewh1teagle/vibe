use crate::cmd::app::{get_commit_hash, is_avx2_enabled};

pub fn get_app_info() -> String {
    use tauri_plugin_os::{arch, platform, type_, version};
    let commit = get_commit_hash();

    let arch = arch();
    let platform = platform();
    let os_ver = version();
    let os_type = type_();
    let models = "List of models"; // Replace with actual models fetching logic

    let info = format!(
        "Commit Hash: {}\n\
         Arch: {}\n\
         Platform: {}\n\
         OS: {}\n\
         OS Version: {}\n\
         Models: {}\n\
         AVX2: {}",
        commit,
        arch,
        platform,
        os_type,
        os_ver,
        models,
        is_avx2_enabled()
    );

    info
}

pub fn get_issue_url(logs: String) -> String {
    let extra_info = get_app_info();
    let subject = urlencoding::encode("RW Vibe - Relato de problema");
    let body = urlencoding::encode(&format!("{}\n\n{}", extra_info, &logs));
    format!("mailto:suporte@rwconsultoria.com.br?subject={}&body={}", subject, body)
}
