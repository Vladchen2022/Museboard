use crate::models::ChatMessage;
use crate::util::http_client;
use reqwest::StatusCode;
use serde_json::Value;

#[tauri::command]
pub async fn lm_studio_chat(
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
                "无法连接 LM Studio：{error}。请确认 LM Studio 已启动本地 Server，\
                 endpoint 通常是 http://localhost:1234/v1。"
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if status != StatusCode::OK {
        return Err(format!("LM Studio 请求失败：HTTP {status}，{body}"));
    }

    extract_chat_content(&body)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_lm_studio_chat_content() {
        let body = r#"{"choices":[{"message":{"content":"{\"nodes\":[]}"}}]}"#;

        assert_eq!(extract_chat_content(body).unwrap(), r#"{"nodes":[]}"#);
    }
}
