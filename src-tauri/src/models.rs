use serde::Serialize;

#[derive(Serialize)]
pub struct ImportedAsset {
    pub file_name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub mime_type: String,
}

#[derive(Serialize)]
pub struct ChatMessage {
    pub role: &'static str,
    pub content: String,
}

#[derive(Serialize)]
pub struct ComfyGeneratedImage {
    pub file_name: String,
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Serialize)]
pub struct AssetData {
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Serialize)]
pub struct ComfyWorkflowPreset {
    pub workflow_json: String,
    pub positive_prompt_node_id: String,
    pub positive_prompt_input: String,
    pub negative_prompt_node_id: String,
    pub negative_prompt_input: String,
    pub width_node_id: String,
    pub width_input: String,
    pub height_node_id: String,
    pub height_input: String,
    pub seed_node_id: String,
    pub seed_input: String,
    pub checkpoint_name: String,
}
