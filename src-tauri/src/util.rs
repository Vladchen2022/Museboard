use crate::models::AssetData;
use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const PROJECT_FILE: &str = "project.museboard.json";

pub fn sanitize_file_name(name: &str) -> String {
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

pub fn expand_home(value: &str) -> String {
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

pub fn parse_launch_command(command: &str) -> Result<Vec<String>, String> {
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
                "ComfyUI 启动命令只支持程序和参数，\
                 不支持 shell 管道、重定向、变量或命令拼接。"
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

pub fn resolve_launch_program(working_dir: &Path, program: &str) -> PathBuf {
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

pub async fn download_image_bytes(url: &str) -> Result<(String, Vec<u8>), String> {
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

pub fn unique_file_name(dir: &Path, safe_name: &str) -> String {
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

pub fn file_name_from_url(url: &str, mime_type: &str) -> String {
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

pub fn extension_from_mime(mime_type: &str) -> &'static str {
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

pub fn mime_from_path(path: &Path) -> &'static str {
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

pub fn to_string(error: std::io::Error) -> String {
    error.to_string()
}

pub fn http_client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|error| format!("创建 HTTP client 失败：{error}"))
}

pub fn normalize_endpoint(endpoint: &str, label: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        Err(format!("未配置 {label} endpoint。"))
    } else {
        Ok(trimmed.to_string())
    }
}

pub fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub fn build_image_preview(bytes: &[u8], max_dimension: u32) -> Result<AssetData, String> {
    let image =
        image::load_from_memory(bytes).map_err(|error| format!("图片预览解码失败：{error}"))?;
    if image.width() <= max_dimension && image.height() <= max_dimension {
        return Err("图片不需要缩略预览。".to_string());
    }

    let preview = image.thumbnail(max_dimension, max_dimension);
    let mut output = Cursor::new(Vec::new());
    preview
        .write_to(&mut output, image::ImageFormat::Jpeg)
        .map_err(|error| format!("图片预览编码失败：{error}"))?;

    Ok(AssetData {
        mime_type: "image/jpeg".to_string(),
        data_base64: general_purpose::STANDARD.encode(output.into_inner()),
    })
}

pub fn resolve_project_asset_path(project_dir: &str, relative_path: &str) -> Result<PathBuf, String> {
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

    Ok(target)
}

pub fn read_asset_data(project_dir: &str, relative_path: &str) -> Result<AssetData, String> {
    let target = resolve_project_asset_path(project_dir, relative_path)?;
    let bytes = fs::read(&target).map_err(to_string)?;
    Ok(AssetData {
        mime_type: mime_from_path(&target).to_string(),
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn builds_downscaled_image_preview() {
        let image = image::RgbImage::from_pixel(4096, 2048, image::Rgb([40, 80, 120]));
        let mut source = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut source, image::ImageFormat::Png)
            .unwrap();

        let preview = build_image_preview(&source.into_inner(), 512).unwrap();
        let bytes = general_purpose::STANDARD.decode(preview.data_base64).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();

        assert_eq!(preview.mime_type, "image/jpeg");
        assert!(decoded.width() <= 512);
        assert!(decoded.height() <= 512);
    }

}
