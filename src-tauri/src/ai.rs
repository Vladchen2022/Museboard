use crate::models::ChatMessage;
use crate::util::http_client;
use reqwest::StatusCode;
use serde_json::Value;

#[tauri::command]
pub async fn ai_chat(
    provider: String,
    endpoint: String,
    api_key: String,
    model: String,
    temperature: f32,
    system: String,
    user: String,
) -> Result<String, String> {
    let endpoint = endpoint.trim().trim_end_matches('/');
    let provider = provider.trim();
    let label = provider_label(provider);
    let model = model.trim();
    let api_key = api_key.trim();

    if endpoint.is_empty() {
        return Err("未配置 AI endpoint。".to_string());
    }
    if model.is_empty() {
        return Err("未填写模型名。".to_string());
    }
    if requires_api_key(provider) && api_key.is_empty() {
        return Err(format!("{label} 需要 API Key。"));
    }

    if provider == "ollama" {
        ollama_chat(endpoint, model, temperature, system, user).await
    } else {
        openai_compatible_chat(endpoint, label, api_key, model, temperature, system, user).await
    }
}

async fn openai_compatible_chat(
    endpoint: &str,
    label: &str,
    api_key: &str,
    model: &str,
    temperature: f32,
    system: String,
    user: String,
) -> Result<String, String> {
    let url = format!("{endpoint}/chat/completions");
    let client = http_client(120)?;
    let mut request = client.post(&url).json(&serde_json::json!({
        "model": model,
        "temperature": temperature,
        "messages": [
            ChatMessage { role: "system", content: system },
            ChatMessage { role: "user", content: user }
        ]
    }));

    if !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }

    let response = request.send().await.map_err(|error| {
        format!(
            "无法连接 {label}：{error}。请确认 endpoint 可访问，模型名正确，云端服务已填写 API Key。"
        )
    })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if status != StatusCode::OK {
        return Err(format!("{label} 请求失败：HTTP {status}，{body}"));
    }

    extract_openai_chat_content(&body, label)
}

async fn ollama_chat(
    endpoint: &str,
    model: &str,
    temperature: f32,
    system: String,
    user: String,
) -> Result<String, String> {
    let url = format!("{endpoint}/api/chat");
    let client = http_client(120)?;
    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "model": model,
            "stream": false,
            "options": {
                "temperature": temperature
            },
            "messages": [
                ChatMessage { role: "system", content: system },
                ChatMessage { role: "user", content: user }
            ]
        }))
        .send()
        .await
        .map_err(|error| {
            format!(
                "无法连接 Ollama：{error}。请确认 Ollama 已启动，默认地址通常是 http://localhost:11434。"
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if status != StatusCode::OK {
        return Err(format!("Ollama 请求失败：HTTP {status}，{body}"));
    }

    extract_ollama_chat_content(&body)
}

fn provider_label(provider: &str) -> &'static str {
    match provider {
        "openai" => "OpenAI",
        "deepseek" => "DeepSeek",
        "ollama" => "Ollama",
        "customOpenAi" => "OpenAI-compatible",
        _ => "LM Studio",
    }
}

fn requires_api_key(provider: &str) -> bool {
    matches!(provider, "openai" | "deepseek")
}

fn extract_openai_chat_content(body: &str, label: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|error| format!("{label} 返回不是合法 JSON：{error}"))?;
    let content = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| format!("{label} 返回内容为空。"))?;

    Ok(content.to_string())
}

fn extract_ollama_chat_content(body: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(body).map_err(|error| format!("Ollama 返回不是合法 JSON：{error}"))?;
    let content = value
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "Ollama 返回内容为空。".to_string())?;

    Ok(content.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_openai_compatible_chat_content() {
        let body = r#"{"choices":[{"message":{"content":"{\"nodes\":[]}"}}]}"#;

        assert_eq!(
            extract_openai_chat_content(body, "OpenAI-compatible").unwrap(),
            r#"{"nodes":[]}"#
        );
    }

    #[test]
    fn extracts_ollama_chat_content() {
        let body = r#"{"message":{"role":"assistant","content":"{\"prose\":\"ok\"}"},"done":true}"#;

        assert_eq!(extract_ollama_chat_content(body).unwrap(), r#"{"prose":"ok"}"#);
    }
}
