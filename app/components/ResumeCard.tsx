import { Link } from "react-router";
import ScoreCircle from "~/components/ScoreCircle";
import { useEffect, useState } from "react";
import { usePuterStore } from "~/lib/puter";
import { GlareCard } from "./GlareCard"; // adjust path as needed

const ResumeCard = ({ resume: { id, companyName, jobTitle, feedback, imagePath } }: { resume: Resume }) => {
  const { fs } = usePuterStore();
  const [resumeUrl, setResumeUrl] = useState('');

  useEffect(() => {
    const loadResume = async () => {
      const blob = await fs.read(imagePath);
      if (!blob) return;
      let url = URL.createObjectURL(blob);
      setResumeUrl(url);
    };

    loadResume();
  }, [imagePath]);

  return (
    <Link to={`/resume/${id}`} className="block">
      <GlareCard className="p-4 cursor-pointer">
        <div className="flex flex-col justify-between h-full gap-4">
          <div className="flex flex-col gap-2">
            {companyName && (
              <h2 className="text-2xl font-semibold text-white tracking-wide">
                {companyName}
              </h2>
            )}
            {jobTitle && (
              <h3 className="text-md text-gray-400 tracking-tight">
                {jobTitle}
              </h3>
            )}
            {!companyName && !jobTitle && (
              <h2 className="text-xl font-semibold text-white">Resume</h2>
            )}
          </div>

          <div className="flex justify-center pt-2">
            <ScoreCircle score={feedback.overallScore} />
          </div>

          {resumeUrl && (
            <div className="w-full h-full flex justify-center pt-4">
              <img
                src={resumeUrl}
                alt="resume"
                className="w-[90%] h-[300px] max-sm:h-[200px] object-contain rounded-xl shadow-lg"
              />
            </div>
          )}
        </div>
      </GlareCard>
    </Link>
  );
};

export default ResumeCard;
