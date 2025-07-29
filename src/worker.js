import { pipeline, env, RawImage } from "@xenova/transformers";

// Enable local model loading
env.allowLocalModels = true;

env.backends.onnx = {
    wasm: {
        path: "/ort/ort-wasm-simd.wasm",
        simd: true,
    },
};

class Singleton {
    static task = null;
    static model = null;
    static quantized = null;
    static instance = null;

    constructor(tokenizer, model, quantized) {
        this.tokenizer = tokenizer;
        this.model = model;
        this.quantized = quantized;
    }

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, {
                quantized: this.quantized,
                progress_callback,
            });
        }
        return this.instance;
    }
}

class ImageClassificationPipelineSingleton extends Singleton {
    static task = "image-classification";
    static model = "efficientnet";
    static quantized = false;
}

self.addEventListener("message", async (event) => {
    const message = event.data;

    if (message.action === "load") {
        await ImageClassificationPipelineSingleton.getInstance();

        const config = await fetch("/models/efficientnet/config.json").then(
            (res) => res.json()
        );

        const labels = Object.values(config.id2label);

        self.postMessage({ status: "ready", labels });
        return;
    }

    const data = new Uint8ClampedArray(message.image.data.length / 4);
    for (let i = 0; i < data.length; ++i) {
        data[i] = message.image.data[i * 4 + 3];
    }
    const img = new RawImage(
        data,
        message.image.width,
        message.image.height,
        1
    );

    const result = await classify(img);
    if (result === null) return;

    self.postMessage({
        status: "result",
        task: "image-classification",
        data: result,
    });
});

const classify = async (image) => {
    const classifier = await ImageClassificationPipelineSingleton.getInstance();

    try {
        const output = await classifier(image, { topk: 0 });
        return output;
    } catch (error) {
        self.postMessage({
            status: "error",
            task: "image-classification",
            data: error.toString(),
        });
        return null;
    }
};
