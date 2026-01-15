use axum::{
    extract::{Query, Request},
    response::{IntoResponse, Response},
    routing::get,
    Router,
    http::{StatusCode, HeaderValue, Method},
};
use serde::Deserialize;
use std::net::SocketAddr;
use tower_http::services::ServeFile;
use tower_http::cors::CorsLayer;
use tower::ServiceExt;

#[derive(Deserialize)]
struct StreamParams {
    file: String,
}

pub async fn start_server(port: u16) {
    // Define allowed origins for Security (CORS)
    // Limits access to the specific Tauri application instances
    let cors = CorsLayer::new()
        .allow_origin([
            "http://localhost:1420".parse::<HeaderValue>().unwrap(),
            "http://127.0.0.1:1420".parse::<HeaderValue>().unwrap(),
            "tauri://localhost".parse::<HeaderValue>().unwrap(),
            "https://tauri.localhost".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods(vec![Method::GET]);

    let app = Router::new()
        .route("/stream", get(stream_handler))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    
    println!("Streaming server listening on {}", addr);

    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
             if let Err(e) = axum::serve(listener, app).await {
                 eprintln!("Server error: {}", e);
             }
        },
        Err(e) => eprintln!("Failed to bind port {}: {}", port, e),
    }
}

async fn stream_handler(Query(params): Query<StreamParams>, req: Request) -> Response {
    let path = params.file;
    // Serve the requested file from the filesystem using absolute path
    match ServeFile::new(path).oneshot(req).await {
        Ok(res) => res.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to open file: {}", err)).into_response(),
    }
}
