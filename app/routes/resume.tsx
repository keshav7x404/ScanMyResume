import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { usePuterStore } from "~/lib/puter";
import Summary from "~/components/Summary";
import ATS from "~/components/ATS";
import Details from "~/components/Details";

const Resume = () => {
    const { auth, isLoading, fs, kv } = usePuterStore();
    const { id } = useParams();
    const [imageUrl, setImageUrl] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && !auth.isAuthenticated) navigate(`/auth?next=/resume/${id}`);
    }, [isLoading, auth.isAuthenticated]);

    useEffect(() => {
        const loadResume = async () => {
            const raw = await kv.get(`resume:${id}`);
            if (!raw) return;
            const data = JSON.parse(raw);

            const resumeBlob = await fs.read(data.resumePath);
            if (resumeBlob) {
                setResumeUrl(URL.createObjectURL(new Blob([resumeBlob], { type: 'application/pdf' })));
            }

            const imageBlob = await fs.read(data.imagePath);
            if (imageBlob) {
                setImageUrl(URL.createObjectURL(imageBlob));
            }

            setFeedback(data.feedback);
        };

        if (id) loadResume();
    }, [id]);

    return (
        <main className="!pt-0">
            <nav className="resume-nav">
                <Link to="/" className="back-button">
                    <img src="/icons/back.svg" alt="back" className="w-2.5 h-2.5" />
                    <span className="text-sm text-white font-semibold">Back to Homepage</span>
                </Link>
            </nav>
            <div className="flex flex-row w-full max-lg:flex-col-reverse">
                <section className="feedback-section h-[100vh] sticky top-0 items-center justify-center bg-gradient-to-br from-[#61045F] via-[#3F0A50] to-[#1A0033]">
                    {imageUrl && resumeUrl && (
                        <div className="animate-in fade-in duration-1000 gradient-border h-[90%] w-fit">
                            <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={imageUrl}
                                    className="w-full h-full object-contain rounded-2xl"
                                    alt="resume preview"
                                />
                            </a>
                        </div>
                    )}
                </section>
                <section className="feedback-section bg-gradient-to-br from-[#61045F] via-[#3F0A50] to-[#1A0033]">
                    <h2 className="text-4xl !text-white font-bold">Resume Review</h2>
                    {feedback ? (
                        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
                            <Summary feedback={feedback} />
                            <ATS score={feedback.ATS?.score ?? 0} suggestions={feedback.ATS?.tips ?? []} />
                            <Details feedback={feedback} />
                        </div>
                    ) : (
                        <img src="/images/resume-scan-2.gif" className="w-full" alt="loading" />
                    )}
                </section>
            </div>
        </main>
    );
};

export default Resume;
