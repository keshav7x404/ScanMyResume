import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not typed
    loadPromise = import("pdfjs-dist/build/pdf.mjs").then((lib) => {
        // workerSrc is resolved/bundled by Vite via `?url`, so it works
        // in both dev and build (no need for a copy in /public).
        lib.GlobalWorkerOptions.workerSrc = workerSrc;
        pdfjsLib = lib;
        return lib;
    });

    return loadPromise;
}

export interface PdfTextResult {
    fullText: string;
    pages: string[];
}

/**
 * Extract selectable text from ALL pages via pdf.getPage(i).getTextContent().
 * Additive helper — convertPdfToImage() above is untouched.
 */
export async function extractPdfText(file: File): Promise<PdfTextResult> {
    const lib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items as unknown[])
            .map((item) =>
                item && typeof item === "object" && "str" in item
                    ? String((item as { str: unknown }).str)
                    : ""
            )
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        pages.push(pageText);
    }

    return { fullText: pages.join("\n\n"), pages };
}

export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    try {
        const lib = await loadPdfJs();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Scale 2 keeps text readable for the vision model while keeping
        // the PNG/base64 payload small (scale 4+ makes uploads very slow).
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (context) {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
        }

        await page.render({ canvasContext: context!, viewport }).promise;

        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Create a File from the blob with the same name as the pdf
                        const originalName = file.name.replace(/\.pdf$/i, "");
                        const imageFile = new File([blob], `${originalName}.jpg`, {
                            type: "image/jpeg",
                        });

                        resolve({
                            imageUrl: URL.createObjectURL(blob),
                            file: imageFile,
                        });
                    } else {
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: "Failed to create image blob",
                        });
                    }
                },
                "image/jpeg",
                0.85
            ); // JPEG ~5-10x smaller than PNG: faster upload, still readable
        });
    } catch (err) {
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${err}`,
        };
    }
}
