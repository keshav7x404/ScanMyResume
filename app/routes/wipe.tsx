import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePuterStore } from "~/lib/puter";

interface StoredResume {
    key: string;
    id: string;
    companyName?: string;
    jobTitle?: string;
    resumePath: string;
    imagePath: string;
}

const WipeApp = () => {
    const { auth, isLoading, fs, kv } = usePuterStore();
    const navigate = useNavigate();
    const [resumes, setResumes] = useState<StoredResume[]>([]);

    const loadResumes = async () => {
        const items = (await kv.list("resume:*", true)) as { key: string; value: string }[];
        const parsed: StoredResume[] = [];
        for (const item of items ?? []) {
            try {
                const data = JSON.parse(item.value);
                parsed.push({
                    key: item.key,
                    id: data.id ?? item.key,
                    companyName: data.companyName,
                    jobTitle: data.jobTitle,
                    resumePath: data.resumePath,
                    imagePath: data.imagePath,
                });
            } catch {
                // Corrupt entry — still list it so it can be deleted.
                parsed.push({
                    key: item.key,
                    id: item.key,
                    resumePath: "",
                    imagePath: "",
                });
            }
        }
        setResumes(parsed);
    };

    useEffect(() => {
        loadResumes();
    }, []);

    useEffect(() => {
        if (!isLoading && !auth.isAuthenticated) {
            navigate("/auth?next=/wipe");
        }
    }, [isLoading, auth.isAuthenticated, navigate]);

    const deleteResume = async (resume: StoredResume) => {
        if (resume.resumePath) await fs.delete(resume.resumePath).catch(() => {});
        if (resume.imagePath) await fs.delete(resume.imagePath).catch(() => {});
        await kv.delete(resume.key);
        await loadResumes();
    };

    const handleDeleteAll = async () => {
        for (const resume of resumes) {
            if (resume.resumePath) await fs.delete(resume.resumePath).catch(() => {});
            if (resume.imagePath) await fs.delete(resume.imagePath).catch(() => {});
        }
        await kv.flush();
        await loadResumes();
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            Authenticated as: {auth.user?.username}
            <div>Stored resumes ({resumes.length}):</div>
            <div className="flex flex-col gap-4">
                {resumes.map((resume) => (
                    <div key={resume.key} className="flex flex-row gap-4 items-center">
                        <p>
                            {resume.companyName || resume.jobTitle
                                ? `${resume.companyName ?? ""} — ${resume.jobTitle ?? ""}`
                                : resume.id}
                        </p>
                        <button
                            className="bg-red-500 text-white px-4 py-2 rounded-md cursor-pointer"
                            onClick={() => deleteResume(resume)}
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>
            <div>
                <button
                    className="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer"
                    onClick={() => handleDeleteAll()}
                >
                    Wipe App Data
                </button>
            </div>
        </div>
    );
};

export default WipeApp;
