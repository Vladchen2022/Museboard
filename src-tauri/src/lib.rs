use base64::{engine::general_purpose, Engine as _};
use reqwest::StatusCode;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PROJECT_FILE: &str = "project.museboard.json";

#[derive(Serialize)]
struct ImportedAsset {
    file_name: String,
    relative_path: String,
    absolute_path: String,
    mime_type: String,
}

#[derive(Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ComfyGeneratedImage {
    file_name: String,
    mime_type: String,
    data_base64: String,
}

#[derive(Serialize)]
struct AssetData {
    mime_type: String,
    data_base64: String,
}

#[derive(Serialize)]
struct ComfyWorkflowPreset {
    workflow_json: String,
    positive_prompt_node_id: String,
    positive_prompt_input: String,
    negative_prompt_node_id: String,
    negative_prompt_input: String,
    width_node_id: String,
    width_input: String,
    height_node_id: String,
    height_input: String,
    seed_node_id: String,
    seed_input: String,
    checkpoint_name: String,
}

#[tauri::command]
fn save_project(project_dir: String, project_json: String) -> Result<(), String> {
    let dir = PathBuf::from(project_dir);
    fs::create_dir_all(dir.join("assets")).map_err(to_string)?;
    let target = dir.join(PROJECT_FILE);
    let temp = dir.join(format!("{PROJECT_FILE}.tmp"));
    fs::write(&temp, project_json).map_err(to_string)?;
    fs::rename(temp, target).map_err(to_string)
}

#[tauri::command]
fn open_project(project_dir: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(project_dir).join(PROJECT_FILE)).map_err(to_string)
}

#[tauri::command]
fn read_project_asset(project_dir: String, relative_path: String) -> Result<AssetData, String> {
    let project_dir = PathBuf::from(project_dir)
        .canonicalize()
        .map_err(|error| format!("项目目录不存在：{error}"))?;
    let assets_dir = project_dir
        .join("assets")
        .canonicalize()
        .map_err(|error| format!("项目 assets 目录不存在：{error}"))?;
    let relative_path = Path::new(relative_path.trim());

    if relative_path.is_absolute() {
        return Err("图片路径必须是项目内相对路径。".to_string());
    }

    let target = project_dir
        .join(relative_path)
        .canonicalize()
        .map_err(|error| format!("图片文件不存在：{error}"))?;

    if !target.starts_with(&assets_dir) {
        return Err("拒绝读取项目 assets 目录之外的文件。".to_string());
    }

    let bytes = fs::read(&target).map_err(to_string)?;
    Ok(AssetData {
        mime_type: mime_from_path(&target).to_string(),
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

#[tauri::command]
fn import_asset(
    project_dir: String,
    file_name: String,
    data_base64: String,
) -> Result<ImportedAsset, String> {
    let dir = PathBuf::from(project_dir);
    let assets_dir = dir.join("assets");
    fs::create_dir_all(&assets_dir).map_err(to_string)?;

    let safe_name = unique_file_name(&assets_dir, &sanitize_file_name(&file_name));
    let bytes = general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("图片 base64 解码失败：{error}"))?;
    let target = assets_dir.join(&safe_name);
    fs::write(&target, bytes).map_err(to_string)?;

    Ok(ImportedAsset {
        file_name: safe_name.clone(),
        relative_path: format!("assets/{safe_name}"),
        absolute_path: target.to_string_lossy().to_string(),
        mime_type: "application/octet-stream".to_string(),
    })
}

#[tauri::command]
async fn import_remote_asset(project_dir: String, url: String) -> Result<ImportedAsset, String> {
    let url = url.trim();
    let (mime_type, bytes) = download_image_bytes(url).await?;
    let dir = PathBuf::from(project_dir);
    let assets_dir = dir.join("assets");
    fs::create_dir_all(&assets_dir).map_err(to_string)?;

    let guessed_name = file_name_from_url(url, &mime_type);
    let safe_name = unique_file_name(&assets_dir, &sanitize_file_name(&guessed_name));
    let target = assets_dir.join(&safe_name);
    fs::write(&target, bytes).map_err(to_string)?;

    Ok(ImportedAsset {
        file_name: safe_name.clone(),
        relative_path: format!("assets/{safe_name}"),
        absolute_path: target.to_string_lossy().to_string(),
        mime_type,
    })
}

#[tauri::command]
async fn download_remote_asset(url: String) -> Result<AssetData, String> {
    let (mime_type, bytes) = download_image_bytes(url.trim()).await?;
    Ok(AssetData {
        mime_type,
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

#[tauri::command]
async fn lm_studio_chat(
    endpoint: String,
    model: String,
    temperature: f32,
    system: String,
    user: String,
) -> Result<String, String> {
    let endpoint = endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err("未配置 LM Studio endpoint。".to_string());
    }
    if model.trim().is_empty() {
        return Err("未填写模型名。".to_string());
    }

    let url = format!("{endpoint}/chat/completions");
    let client = http_client(120)?;
    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "model": model.trim(),
            "temperature": temperature,
            "messages": [
                ChatMessage { role: "system", content: system },
                ChatMessage { role: "user", content: user }
            ]
        }))
        .send()
        .await
        .map_err(|error| {
            format!(
                "无法连接 LM Studio：{error}。请确认 LM Studio 已启动本地 Server，endpoint 通常是 http://localhost:1234/v1。"
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if status != StatusCode::OK {
        return Err(format!("LM Studio 请求失败：HTTP {status}，{body}"));
    }

    extract_chat_content(&body)
}

#[tauri::command]
fn set_window_always_on_top(window: tauri::Window, always_on_top: bool) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn comfyui_check(endpoint: String) -> Result<(), String> {
    let endpoint = normalize_endpoint(&endpoint, "ComfyUI")?;
    let url = format!("{endpoint}/system_stats");
    let client = http_client(10)?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("无法连接 ComfyUI：{error}。请确认 ComfyUI 已启动，默认地址是 http://127.0.0.1:8188。"))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("ComfyUI 连接失败：HTTP {}", response.status()))
    }
}

#[tauri::command]
fn comfyui_start(working_dir: String, launch_command: String) -> Result<(), String> {
    let working_dir = expand_home(working_dir.trim());
    if working_dir.trim().is_empty() {
        return Err("未配置 ComfyUI 工作目录。".to_string());
    }

    let dir = PathBuf::from(&working_dir);
    if !dir.exists() {
        return Err(format!("ComfyUI 工作目录不存在：{working_dir}"));
    }

    let args = parse_launch_command(&launch_command)?;
    let program = resolve_launch_program(&dir, &args[0]);

    Command::new(program)
        .args(&args[1..])
        .current_dir(&dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("启动 ComfyUI 失败：{error}"))?;

    Ok(())
}

#[tauri::command]
async fn comfyui_default_workflow(endpoint: String) -> Result<ComfyWorkflowPreset, String> {
    let endpoint = normalize_endpoint(&endpoint, "ComfyUI")?;
    let client = http_client(15)?;
    let response = client
        .get(format!("{endpoint}/object_info/CheckpointLoaderSimple"))
        .send()
        .await
        .map_err(|error| format!("无法读取 ComfyUI checkpoint 列表：{error}"))?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("读取 ComfyUI checkpoint 列表失败：HTTP {status}，{body}"));
    }

    let value: Value = serde_json::from_str(&body)
        .map_err(|error| format!("ComfyUI checkpoint 信息不是合法 JSON：{error}"))?;
    let checkpoints = value
        .get("CheckpointLoaderSimple")
        .and_then(|node| node.get("input"))
        .and_then(|input| input.get("required"))
        .and_then(|required| required.get("ckpt_name"))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_array)
        .ok_or_else(|| "没有从 ComfyUI 读取到 checkpoint。".to_string())?;

    let checkpoint = checkpoints
        .iter()
        .filter_map(Value::as_str)
        .find(|name| name.to_lowercase().contains("xl"))
        .or_else(|| checkpoints.iter().filter_map(Value::as_str).next())
        .ok_or_else(|| "ComfyUI checkpoint 列表为空。".to_string())?;

    Ok(standard_comfy_preset(checkpoint))
}

#[tauri::command]
async fn comfyui_flux_workflow(endpoint: String) -> Result<ComfyWorkflowPreset, String> {
    let endpoint = normalize_endpoint(&endpoint, "ComfyUI")?;
    let unet_info = fetch_comfy_object_info(&endpoint, "UNETLoader").await?;
    let clip_info = fetch_comfy_object_info(&endpoint, "CLIPLoader").await?;
    let vae_info = fetch_comfy_object_info(&endpoint, "VAELoader").await?;
    fetch_comfy_object_info(&endpoint, "Flux2Scheduler").await?;
    fetch_comfy_object_info(&endpoint, "EmptyFlux2LatentImage").await?;
    fetch_comfy_object_info(&endpoint, "CFGGuider").await?;
    fetch_comfy_object_info(&endpoint, "ConditioningZeroOut").await?;

    let unets = combo_values(&unet_info, "UNETLoader", "unet_name")?;
    let clips = combo_values(&clip_info, "CLIPLoader", "clip_name")?;
    let clip_types = combo_values(&clip_info, "CLIPLoader", "type")?;
    let vaes = combo_values(&vae_info, "VAELoader", "vae_name")?;

    if !clip_types.iter().any(|item| item == "flux2") {
        return Err("当前 ComfyUI 的 CLIPLoader 不支持 flux2 类型。".to_string());
    }

    let unet = pick_named_model(&unets, &["flux-2", "flux2", "flux"])
        .ok_or_else(|| "没有从 ComfyUI 读取到 Flux UNet 模型。".to_string())?;
    let clip = pick_named_model(&clips, &["qwen", "flux", "t5"])
        .ok_or_else(|| "没有从 ComfyUI 读取到可用于 Flux2 的 CLIP 模型。".to_string())?;
    let vae = pick_named_model(&vaes, &["flux2", "flux", "ae"])
        .ok_or_else(|| "没有从 ComfyUI 读取到 Flux VAE。".to_string())?;

    Ok(flux2_comfy_preset(&unet, &clip, &vae))
}

#[tauri::command]
async fn comfyui_generate(
    endpoint: String,
    workflow_json: String,
    positive_prompt_node_id: String,
    positive_prompt_input: String,
    negative_prompt_node_id: String,
    negative_prompt_input: String,
    width_node_id: String,
    width_input: String,
    height_node_id: String,
    height_input: String,
    seed_node_id: String,
    seed_input: String,
    prompt: String,
    width: u32,
    height: u32,
) -> Result<ComfyGeneratedImage, String> {
    let endpoint = normalize_endpoint(&endpoint, "ComfyUI")?;
    let workflow = build_comfy_workflow(
        &workflow_json,
        &positive_prompt_node_id,
        &positive_prompt_input,
        &negative_prompt_node_id,
        &negative_prompt_input,
        &width_node_id,
        &width_input,
        &height_node_id,
        &height_input,
        &seed_node_id,
        &seed_input,
        &prompt,
        width,
        height,
    )?;

    let client = http_client(30)?;
    let client_id = format!("museboard-{}", unix_millis());
    let response = client
        .post(format!("{endpoint}/prompt"))
        .json(&serde_json::json!({
            "client_id": client_id,
            "prompt": workflow
        }))
        .send()
        .await
        .map_err(|error| format!("提交 ComfyUI 任务失败：{error}"))?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("提交 ComfyUI 任务失败：HTTP {status}，{body}"));
    }

    let prompt_id = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("prompt_id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .ok_or_else(|| "ComfyUI 没有返回 prompt_id。".to_string())?;

    let image = poll_comfy_image(&client, &endpoint, &prompt_id).await?;
    download_comfy_image(&client, &endpoint, image).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_project,
            open_project,
            read_project_asset,
            import_asset,
            import_remote_asset,
            download_remote_asset,
            lm_studio_chat,
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

fn sanitize_file_name(name: &str) -> String {
    let path = Path::new(name);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image");

    let cleaned: String = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();

    if cleaned.trim_matches('_').is_empty() {
        "image".to_string()
    } else {
        cleaned
    }
}

fn expand_home(value: &str) -> String {
    if value == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| value.to_string());
    }
    if let Some(rest) = value.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    value.to_string()
}

fn parse_launch_command(command: &str) -> Result<Vec<String>, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("未配置 ComfyUI 启动命令。".to_string());
    }

    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for ch in trimmed.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        if ch == '\\' {
            escaped = true;
            continue;
        }

        if let Some(quote_char) = quote {
            if ch == quote_char {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }

        if matches!(ch, '\'' | '"') {
            quote = Some(ch);
            continue;
        }

        if ch.is_whitespace() {
            if !current.is_empty() {
                args.push(current);
                current = String::new();
            }
            continue;
        }

        if matches!(ch, ';' | '|' | '&' | '<' | '>' | '`' | '$' | '(' | ')') {
            return Err(
                "ComfyUI 启动命令只支持程序和参数，不支持 shell 管道、重定向、变量或命令拼接。"
                    .to_string(),
            );
        }

        current.push(ch);
    }

    if escaped {
        return Err("ComfyUI 启动命令末尾存在未完成的转义字符。".to_string());
    }
    if quote.is_some() {
        return Err("ComfyUI 启动命令存在未闭合的引号。".to_string());
    }
    if !current.is_empty() {
        args.push(current);
    }
    if args.is_empty() {
        return Err("未配置 ComfyUI 启动命令。".to_string());
    }

    Ok(args)
}

fn resolve_launch_program(working_dir: &Path, program: &str) -> PathBuf {
    let expanded = expand_home(program);
    let program_path = PathBuf::from(&expanded);
    if program_path.is_absolute() {
        return program_path;
    }
    if expanded.contains('/') || expanded.contains('\\') {
        return working_dir.join(program_path);
    }
    PathBuf::from(expanded)
}

async fn download_image_bytes(url: &str) -> Result<(String, Vec<u8>), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("只支持拖入 http/https 图片链接。".to_string());
    }

    let client = http_client(30)?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("下载网络图片失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载网络图片失败：HTTP {}", response.status()));
    }

    let mime_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .trim()
        .to_string();

    if !mime_type.starts_with("image/") {
        return Err(format!("链接不是图片资源：{mime_type}"));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取网络图片失败：{error}"))?;

    Ok((mime_type, bytes.to_vec()))
}

fn unique_file_name(dir: &Path, safe_name: &str) -> String {
    let path = Path::new(safe_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let ext = path.extension().and_then(|value| value.to_str());

    for index in 0..10000 {
        let candidate = if index == 0 {
            safe_name.to_string()
        } else if let Some(ext) = ext {
            format!("{stem}_{index}.{ext}")
        } else {
            format!("{stem}_{index}")
        };

        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }

    format!("{stem}_overflow")
}

fn file_name_from_url(url: &str, mime_type: &str) -> String {
    let without_query = url.split(['?', '#']).next().unwrap_or(url);
    let candidate = without_query
        .rsplit('/')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("image");

    if Path::new(candidate).extension().is_some() {
        candidate.to_string()
    } else {
        format!("{candidate}.{}", extension_from_mime(mime_type))
    }
}

fn extension_from_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        "image/avif" => "avif",
        "image/heic" => "heic",
        _ => "img",
    }
}

fn mime_from_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "avif" => "image/avif",
        "heic" => "image/heic",
        _ => "application/octet-stream",
    }
}

fn to_string(error: std::io::Error) -> String {
    error.to_string()
}

fn http_client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|error| format!("创建 HTTP client 失败：{error}"))
}

fn extract_chat_content(body: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|error| format!("LM Studio 返回不是合法 JSON：{error}"))?;
    let content = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "LM Studio 返回内容为空。".to_string())?;

    Ok(content.to_string())
}

fn normalize_endpoint(endpoint: &str, label: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        Err(format!("未配置 {label} endpoint。"))
    } else {
        Ok(trimmed.to_string())
    }
}

#[allow(clippy::too_many_arguments)]
fn build_comfy_workflow(
    workflow_json: &str,
    positive_prompt_node_id: &str,
    positive_prompt_input: &str,
    negative_prompt_node_id: &str,
    negative_prompt_input: &str,
    width_node_id: &str,
    width_input: &str,
    height_node_id: &str,
    height_input: &str,
    seed_node_id: &str,
    seed_input: &str,
    prompt: &str,
    width: u32,
    height: u32,
) -> Result<Value, String> {
    if workflow_json.trim().is_empty() {
        return Err("未导入 ComfyUI API workflow JSON。".to_string());
    }

    let mut workflow: Value = serde_json::from_str(workflow_json)
        .map_err(|error| format!("ComfyUI workflow 不是合法 JSON：{error}"))?;

    set_workflow_input(
        &mut workflow,
        positive_prompt_node_id,
        positive_prompt_input,
        Value::String(prompt.to_string()),
        "正向提示词",
    )?;

    if !negative_prompt_node_id.trim().is_empty() && !negative_prompt_input.trim().is_empty() {
        set_workflow_input(
            &mut workflow,
            negative_prompt_node_id,
            negative_prompt_input,
            Value::String("low quality, blurry, distorted, extra limbs, bad anatomy, watermark, text".to_string()),
            "负向提示词",
        )?;
    }

    set_workflow_input(
        &mut workflow,
        width_node_id,
        width_input,
        Value::from(width),
        "宽度",
    )?;
    set_workflow_input(
        &mut workflow,
        height_node_id,
        height_input,
        Value::from(height),
        "高度",
    )?;

    if !seed_node_id.trim().is_empty() && !seed_input.trim().is_empty() {
        set_workflow_input(
            &mut workflow,
            seed_node_id,
            seed_input,
            Value::from((unix_millis() % 9_000_000_000) as u64),
            "种子",
        )?;
    }

    Ok(workflow)
}

fn set_workflow_input(
    workflow: &mut Value,
    node_id: &str,
    input_name: &str,
    value: Value,
    label: &str,
) -> Result<(), String> {
    let input_name = input_name.trim();
    let node_ids: Vec<&str> = node_id
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect();

    if node_ids.is_empty() || input_name.is_empty() {
        return Err(format!("{label}节点 ID 或字段名未配置。"));
    }

    for node_id in node_ids {
        let inputs = workflow
            .get_mut(node_id)
            .and_then(|node| node.get_mut("inputs"))
            .and_then(Value::as_object_mut)
            .ok_or_else(|| format!("workflow 中找不到 {label} 节点 {node_id} 的 inputs。"))?;
        inputs.insert(input_name.to_string(), value.clone());
    }
    Ok(())
}

async fn fetch_comfy_object_info(endpoint: &str, node_type: &str) -> Result<Value, String> {
    let client = http_client(15)?;
    let response = client
        .get(format!("{endpoint}/object_info/{node_type}"))
        .send()
        .await
        .map_err(|error| format!("无法读取 ComfyUI 节点 {node_type}：{error}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("读取 ComfyUI 节点 {node_type} 失败：HTTP {status}，{body}"));
    }
    serde_json::from_str(&body)
        .map_err(|error| format!("ComfyUI 节点 {node_type} 信息不是合法 JSON：{error}"))
}

fn combo_values(object_info: &Value, node_type: &str, input_name: &str) -> Result<Vec<String>, String> {
    let values = object_info
        .get(node_type)
        .and_then(|node| node.get("input"))
        .and_then(|input| input.get("required"))
        .and_then(|required| required.get(input_name))
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_array)
        .ok_or_else(|| format!("没有从 ComfyUI 节点 {node_type} 读取到 {input_name} 列表。"))?;

    Ok(values
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect())
}

fn pick_named_model(values: &[String], priorities: &[&str]) -> Option<String> {
    for priority in priorities {
        if let Some(value) = values
            .iter()
            .find(|value| value.to_lowercase().contains(priority))
        {
            return Some(value.clone());
        }
    }
    values.first().cloned()
}

fn standard_comfy_preset(checkpoint: &str) -> ComfyWorkflowPreset {
    let workflow = serde_json::json!({
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": checkpoint
            }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "Museboard positive prompt",
                "clip": ["1", 1]
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "low quality, blurry, distorted, extra limbs, bad anatomy, watermark, text",
                "clip": ["1", 1]
            }
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 1
            }
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 1,
                "steps": 8,
                "cfg": 2.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0]
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["5", 0],
                "vae": ["1", 2]
            }
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["6", 0],
                "filename_prefix": "Museboard"
            }
        }
    });

    ComfyWorkflowPreset {
        workflow_json: serde_json::to_string_pretty(&workflow).unwrap_or_else(|_| "{}".to_string()),
        positive_prompt_node_id: "2".to_string(),
        positive_prompt_input: "text".to_string(),
        negative_prompt_node_id: "3".to_string(),
        negative_prompt_input: "text".to_string(),
        width_node_id: "4".to_string(),
        width_input: "width".to_string(),
        height_node_id: "4".to_string(),
        height_input: "height".to_string(),
        seed_node_id: "5".to_string(),
        seed_input: "seed".to_string(),
        checkpoint_name: checkpoint.to_string(),
    }
}

fn flux2_comfy_preset(unet: &str, clip: &str, vae: &str) -> ComfyWorkflowPreset {
    let workflow = serde_json::json!({
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": unet,
                "weight_dtype": "default"
            }
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": clip,
                "type": "flux2",
                "device": "default"
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": vae
            }
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "Museboard Flux2 prompt",
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "ConditioningZeroOut",
            "inputs": {
                "conditioning": ["4", 0]
            }
        },
        "6": {
            "class_type": "CFGGuider",
            "inputs": {
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "cfg": 1.0
            }
        },
        "7": {
            "class_type": "RandomNoise",
            "inputs": {
                "noise_seed": 1
            }
        },
        "8": {
            "class_type": "KSamplerSelect",
            "inputs": {
                "sampler_name": "euler"
            }
        },
        "9": {
            "class_type": "Flux2Scheduler",
            "inputs": {
                "steps": 4,
                "width": 1024,
                "height": 1024
            }
        },
        "10": {
            "class_type": "EmptyFlux2LatentImage",
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 1
            }
        },
        "11": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["7", 0],
                "guider": ["6", 0],
                "sampler": ["8", 0],
                "sigmas": ["9", 0],
                "latent_image": ["10", 0]
            }
        },
        "12": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["11", 0],
                "vae": ["3", 0]
            }
        },
        "13": {
            "class_type": "SaveImage",
            "inputs": {
                "images": ["12", 0],
                "filename_prefix": "Museboard_flux2"
            }
        }
    });

    ComfyWorkflowPreset {
        workflow_json: serde_json::to_string_pretty(&workflow).unwrap_or_else(|_| "{}".to_string()),
        positive_prompt_node_id: "4".to_string(),
        positive_prompt_input: "text".to_string(),
        negative_prompt_node_id: String::new(),
        negative_prompt_input: String::new(),
        width_node_id: "9,10".to_string(),
        width_input: "width".to_string(),
        height_node_id: "9,10".to_string(),
        height_input: "height".to_string(),
        seed_node_id: "7".to_string(),
        seed_input: "noise_seed".to_string(),
        checkpoint_name: format!("{unet} / {clip} / {vae}"),
    }
}

struct ComfyImageRef {
    filename: String,
    subfolder: String,
    image_type: String,
}

async fn poll_comfy_image(
    client: &reqwest::Client,
    endpoint: &str,
    prompt_id: &str,
) -> Result<ComfyImageRef, String> {
    for _ in 0..180 {
        let response = client
            .get(format!("{endpoint}/history/{prompt_id}"))
            .send()
            .await
            .map_err(|error| format!("读取 ComfyUI 任务结果失败：{error}"))?;

        if response.status().is_success() {
            let history = response.json::<Value>().await.map_err(|error| {
                format!("ComfyUI history 返回不是合法 JSON：{error}")
            })?;
            if let Some(error) = extract_comfy_error(&history, prompt_id) {
                return Err(error);
            }
            if let Some(image) = extract_comfy_image_ref(&history, prompt_id) {
                return Ok(image);
            }
        }

        tokio::time::sleep(Duration::from_millis(1000)).await;
    }

    Err("等待 ComfyUI 生成超时。".to_string())
}

fn extract_comfy_error(history: &Value, prompt_id: &str) -> Option<String> {
    let status = history.get(prompt_id)?.get("status")?;
    if status.get("status_str").and_then(Value::as_str) != Some("error") {
        return None;
    }
    let messages = status.get("messages")?.as_array()?;
    for message in messages {
        let items = message.as_array()?;
        if items.first().and_then(Value::as_str) != Some("execution_error") {
            continue;
        }
        let detail = items.get(1)?;
        let node = detail
            .get("node_type")
            .and_then(Value::as_str)
            .unwrap_or("ComfyUI");
        let node_id = detail.get("node_id").and_then(Value::as_str).unwrap_or("");
        let body = detail
            .get("exception_message")
            .and_then(Value::as_str)
            .unwrap_or("生成失败。")
            .trim();
        return Some(format!("{node} {node_id}: {body}"));
    }
    Some("ComfyUI 生成失败。".to_string())
}

fn extract_comfy_image_ref(history: &Value, prompt_id: &str) -> Option<ComfyImageRef> {
    let outputs = history.get(prompt_id)?.get("outputs")?.as_object()?;
    for output in outputs.values() {
        let Some(images) = output.get("images").and_then(Value::as_array) else {
            continue;
        };
        let Some(image) = images.first() else {
            continue;
        };
        let filename = image.get("filename")?.as_str()?.to_string();
        let subfolder = image
            .get("subfolder")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let image_type = image
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("output")
            .to_string();
        return Some(ComfyImageRef {
            filename,
            subfolder,
            image_type,
        });
    }
    None
}

async fn download_comfy_image(
    client: &reqwest::Client,
    endpoint: &str,
    image: ComfyImageRef,
) -> Result<ComfyGeneratedImage, String> {
    let response = client
        .get(format!("{endpoint}/view"))
        .query(&[
            ("filename", image.filename.as_str()),
            ("subfolder", image.subfolder.as_str()),
            ("type", image.image_type.as_str()),
        ])
        .send()
        .await
        .map_err(|error| format!("下载 ComfyUI 图片失败：{error}"))?;

    let status = response.status();
    let mime_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_string();

    if !status.is_success() {
        return Err(format!("下载 ComfyUI 图片失败：HTTP {status}"));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 ComfyUI 图片失败：{error}"))?;
    Ok(ComfyGeneratedImage {
        file_name: image.filename,
        mime_type,
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn saves_and_opens_project_json() {
        let dir = temp_project_dir();
        let json = r#"{"version":1,"name":"io-test"}"#.to_string();

        save_project(dir.to_string_lossy().to_string(), json.clone()).unwrap();
        let loaded = open_project(dir.to_string_lossy().to_string()).unwrap();

        assert_eq!(loaded, json);
        assert!(dir.join("assets").is_dir());
        assert!(!dir.join(format!("{PROJECT_FILE}.tmp")).exists());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn imports_asset_into_assets_directory() {
        let dir = temp_project_dir();
        let data = general_purpose::STANDARD.encode([137, 80, 78, 71]);

        let imported =
            import_asset(dir.to_string_lossy().to_string(), "hello image.png".into(), data)
                .unwrap();

        assert_eq!(imported.relative_path, format!("assets/{}", imported.file_name));
        assert!(imported.file_name.ends_with(".png"));
        assert!(PathBuf::from(&imported.absolute_path).is_file());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_only_assets_inside_project_directory() {
        let dir = temp_project_dir();
        let assets_dir = dir.join("assets");
        fs::create_dir_all(&assets_dir).unwrap();
        fs::write(assets_dir.join("reference.png"), [137, 80, 78, 71]).unwrap();
        fs::write(dir.join("project.museboard.json"), "{}").unwrap();

        let data = read_project_asset(
            dir.to_string_lossy().to_string(),
            "assets/reference.png".to_string(),
        )
        .unwrap();

        assert_eq!(data.mime_type, "image/png");
        assert_eq!(data.data_base64, general_purpose::STANDARD.encode([137, 80, 78, 71]));
        assert!(read_project_asset(
            dir.to_string_lossy().to_string(),
            "assets/../project.museboard.json".to_string(),
        )
        .is_err());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn extracts_lm_studio_chat_content() {
        let body = r#"{"choices":[{"message":{"content":"{\"nodes\":[]}"}}]}"#;

        assert_eq!(extract_chat_content(body).unwrap(), r#"{"nodes":[]}"#);
    }

    #[test]
    fn creates_file_name_from_url_and_mime() {
        assert_eq!(
            file_name_from_url("https://example.com/path/reference", "image/png"),
            "reference.png"
        );
        assert_eq!(
            file_name_from_url("https://example.com/path/reference.jpg?size=large", "image/jpeg"),
            "reference.jpg"
        );
    }

    #[test]
    fn parses_comfy_launch_command_without_shell() {
        assert_eq!(
            parse_launch_command(".venv/bin/python main.py --listen 127.0.0.1 --port 8188")
                .unwrap(),
            vec![
                ".venv/bin/python",
                "main.py",
                "--listen",
                "127.0.0.1",
                "--port",
                "8188"
            ]
        );
        assert_eq!(
            parse_launch_command(r#""/Users/me/Comfy UI/.venv/bin/python" main.py"#).unwrap(),
            vec!["/Users/me/Comfy UI/.venv/bin/python", "main.py"]
        );
    }

    #[test]
    fn rejects_shell_syntax_in_comfy_launch_command() {
        assert!(parse_launch_command("python main.py; rm -rf ~/Pictures").is_err());
        assert!(parse_launch_command("python main.py | tee log.txt").is_err());
        assert!(parse_launch_command("python main.py $EXTRA").is_err());
        assert!(parse_launch_command(r#""python main.py"#).is_err());
    }

    fn temp_project_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("museboard_test_{stamp}"))
    }
}
