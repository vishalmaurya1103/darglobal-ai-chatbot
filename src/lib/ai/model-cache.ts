import path from "node:path";
import { env } from "@huggingface/transformers";

// Keep model weights inside the project so the Docker image can ship them pre-downloaded.
env.cacheDir = process.env.MODEL_CACHE_DIR ?? path.join(process.cwd(), ".cache", "models");
