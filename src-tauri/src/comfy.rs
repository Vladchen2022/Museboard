use crate::models::{ComfyGeneratedImage, ComfyWorkflowPreset};
use crate::util::{
    expand_home, http_client, normalize_endpoint, parse_launch_command, resolve_launch_program,
    unix_millis,
};
use base64::{engine::general_purpose, Engine as _};
use serde_json::Value;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

#[tauri::command]
pub async fn comfyui_check(endpoint: String) -> Result<(), String> {
    let endpoint = normalize_endpoint(&endpoint, "ComfyUI")?;
    let url = format!("{endpoint}/system_stats");
    let client = http_client(10)?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| {
            format!(
                "无法连接 ComfyUI：{error}。请确认 ComfyUI 已启动，\
                 默认地址是 http://127.0.0.1:8188。"
            )
        })?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("ComfyUI 连接失败：HTTP {}", response.status()))
    }
}

#[tauri::command]
pub fn comfyui_start(working_dir: String, launch_command: String) -> Result<(), String> {
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
pub async fn comfyui_default_workflow(endpoint: String) -> Result<ComfyWorkflowPreset, String> {
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
pub async fn comfyui_flux_workflow(endpoint: String) -> Result<ComfyWorkflowPreset, String> {
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

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn comfyui_generate(
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
            Value::String(
                "low quality, blurry, distorted, extra limbs, bad anatomy, watermark, text"
                    .to_string(),
            ),
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
            let history = response
                .json::<Value>()
                .await
                .map_err(|error| format!("ComfyUI history 返回不是合法 JSON：{error}"))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_workflow_sets_prompt_size_and_seed() {
        let workflow = serde_json::json!({
            "p": { "inputs": { "text": "" } },
            "size": { "inputs": { "width": 1, "height": 1 } },
            "seed": { "inputs": { "seed": 1 } }
        });

        let result = build_comfy_workflow(
            &workflow.to_string(),
            "p",
            "text",
            "",
            "",
            "size",
            "width",
            "size",
            "height",
            "seed",
            "seed",
            "cinematic robot repair scene",
            1280,
            720,
        )
        .unwrap();

        assert_eq!(result["p"]["inputs"]["text"], "cinematic robot repair scene");
        assert_eq!(result["size"]["inputs"]["width"], 1280);
        assert_eq!(result["size"]["inputs"]["height"], 720);
        assert!(result["seed"]["inputs"]["seed"].as_u64().is_some());
    }
}
