import { type FormEvent, useState } from 'react';
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import { usePuterStore } from "~/lib/puter";
import { useNavigate } from "react-router-dom";
import { convertPdfToImage, extractPdfText } from "~/lib/pdf2img";
import { analyzeLocalAts } from "~/lib/atsLocal";
import { generateUUID } from "~/lib/utils";
import { prepareInstructions } from "../../constants";
import { analyzeResumeWithGemini } from "~/lib/gemini";

const Upload = () => {
    const { fs, kv } = usePuterStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    // Bumped only when the file is cleared: react-dropzone keeps its own
    // file state with no reset API, so the "remove" button needs a fresh
    // instance to actually clear the UI. (Never remount on select — that
    // would wipe the just-dropped file from the display.)
    const [uploaderKey, setUploaderKey] = useState(0);

    const handleFileSelect = (f: File | null) => {
        if (!f) setUploaderKey((k) => k + 1);
        setFile(f);
    };

    const handleAnalyze = async ({
        companyName, jobTitle, jobDescription, file,
    }: { companyName: string; jobTitle: string; jobDescription: string; file: File }) => {
        setIsProcessing(true);
        let analyzeTimer: ReturnType<typeof setInterval> | null = null;
        const stopAnalyzeTimer = () => {
            if (analyzeTimer) {
                clearInterval(analyzeTimer);
                analyzeTimer = null;
            }
        };

        try {
            setStatusText('Saving resume...');
            const uploadedFile = await fs.upload([file]);
            if (!uploadedFile) {
                setStatusText('Error: Failed to save file.');
                setIsProcessing(false);
                return;
            }

            setStatusText('Converting PDF to image...');
            const imageResult = await convertPdfToImage(file);
            if (!imageResult.file) {
                setStatusText(`Error: Failed to convert PDF to image. ${imageResult.error ?? ''}`);
                setIsProcessing(false);
                return;
            }

            setStatusText('Saving image...');
            const uploadedImage = await fs.upload([imageResult.file]);
            if (!uploadedImage) {
                setStatusText('Error: Failed to save image.');
                setIsProcessing(false);
                return;
            }

            const uuid = generateUUID();
            const data: {
                id: string;
                resumePath: string;
                imagePath: string;
                companyName: string;
                jobTitle: string;
                jobDescription: string;
                feedback: Feedback | "";
                atsLocal?: unknown;
            } = {
                id: uuid,
                resumePath: uploadedFile.path,
                imagePath: uploadedImage.path,
                companyName,
                jobTitle,
                jobDescription,
                feedback: '',
            };
            await kv.set(`resume:${uuid}`, JSON.stringify(data));

            setStatusText('Extracting resume text...');
            const { fullText: resumeText, pages: resumePages } = await extractPdfText(file);

            setStatusText('Analyzing ...');
            // Live elapsed counter + retry notes so "slow model" is
            // distinguishable from "stuck".
            const analyzeStart = Date.now();
            let analyzeNote = "";
            analyzeTimer = setInterval(() => {
                const s = Math.round((Date.now() - analyzeStart) / 1000);
                setStatusText(`Analyzing ... (${s}s elapsed)${analyzeNote}`);
            }, 1000);
            // prepareInstructions() prompt is used verbatim; the extracted
            // text of ALL pages is appended so Gemini sees more than page 1.
            const instructions =
                prepareInstructions({ jobTitle, jobDescription }) +
                `\n\nRESUME TEXT (extracted from all ${resumePages.length} page(s); treat it as the source of truth alongside the image):\n${resumeText.slice(0, 15000)}`;
            const feedbackText = await analyzeResumeWithGemini(imageResult.file, instructions, {
                onEvent: (msg) => {
                    analyzeNote = msg ? ` — ${msg}` : "";
                },
            });
            stopAnalyzeTimer();
            if (!feedbackText) {
                setStatusText('Error: AI analysis returned no result.');
                setIsProcessing(false);
                return;
            }

            let parsed: Feedback;
            try {
                parsed = JSON.parse(feedbackText) as Feedback;
            } catch {
                setStatusText('Error: AI returned invalid JSON. Please try again.');
                setIsProcessing(false);
                return;
            }

            // Deterministic local ATS simulation (keyword matching + parsing
            // checks over ALL pages) blended 50/50 with Gemini's ATS score.
            const localAts = analyzeLocalAts(resumeText, {
                jobTitle,
                jobDescription,
                pageCount: resumePages.length,
            });
            const geminiAtsScore = parsed.ATS?.score;
            const geminiAtsTips = parsed.ATS?.tips ?? [];
            parsed.ATS = {
                score: Math.round(
                    0.5 *
                        (typeof geminiAtsScore === "number"
                            ? geminiAtsScore
                            : localAts.score) +
                        0.5 * localAts.score
                ),
                tips: [...localAts.tips, ...geminiAtsTips],
            };
            data.atsLocal = localAts;

            // Keep the headline score consistent with the displayed parts:
            // Gemini's overallScore predates our ATS blend, so recompute it
            // as the mean of the five section scores (incl. blended ATS).
            const partScores = [
                parsed.toneAndStyle?.score,
                parsed.content?.score,
                parsed.structure?.score,
                parsed.skills?.score,
                parsed.ATS.score,
            ].filter((s): s is number => typeof s === "number");
            if (partScores.length) {
                parsed.overallScore = Math.round(
                    partScores.reduce((a, b) => a + b, 0) / partScores.length
                );
            }
            data.feedback = parsed;
            await kv.set(`resume:${uuid}`, JSON.stringify(data));

            setStatusText('Done! Redirecting...');
            stopAnalyzeTimer();
            navigate(`/resume/${uuid}`);
        } catch (err) {
            stopAnalyzeTimer();
            console.error("[upload] analyze failed:", err);
            setStatusText(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsProcessing(false);
        }
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!file) return;
        const formData = new FormData(e.currentTarget);
        handleAnalyze({
            companyName: formData.get('company-name') as string,
            jobTitle: formData.get('job-title') as string,
            jobDescription: formData.get('job-description') as string,
            file,
        });
    };

    return (
        <main className="bg-[url('/images/bg-auth-new.jpg')] bg-cover">
            <Navbar />
            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>
                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full max-w-md" alt="scanning" />
                        </>
                    ) : (
                        <h2>Drop your resume for an ATS score and improvement tips</h2>
                    )}
                    {!isProcessing && (
                        <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8 w-full max-w-2xl">
                            <div className="form-div">
                                <label htmlFor="company-name">Company Name</label>
                                <input type="text" name="company-name" placeholder="Company Name" id="company-name" required />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-title">Job Title</label>
                                <input type="text" name="job-title" placeholder="Job Title" id="job-title" required />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-description">Job Description</label>
                                <textarea rows={5} name="job-description" placeholder="Paste the job description here..." id="job-description" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="uploader">Upload Resume (PDF)</label>
                                <FileUploader
                                    key={uploaderKey}
                                    onFileSelect={handleFileSelect}
                                />
                            </div>
                            <button className="primary-button" type="submit" disabled={!file || isProcessing}>
                                Analyze Resume
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    );
};

export default Upload;
