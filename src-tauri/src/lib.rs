mod ai;
mod comfy;
mod models;
mod project;
mod util;
mod window;

use ai::ai_chat;
use comfy::{
    comfyui_check, comfyui_default_workflow, comfyui_flux_workflow, comfyui_generate, comfyui_start,
};
use project::{
    download_remote_asset, import_asset, import_remote_asset, open_project, read_project_asset,
    read_project_asset_preview, save_project,
};
use window::set_window_always_on_top;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_project,
            open_project,
            read_project_asset,
            read_project_asset_preview,
            import_asset,
            import_remote_asset,
            download_remote_asset,
            ai_chat,
            set_window_always_on_top,
            comfyui_check,
            comfyui_start,
            comfyui_default_workflow,
            comfyui_flux_workflow,
            comfyui_generate
        ])
        .run(tauri::generate_context!())
        .expect("error while running Museboard");
}
