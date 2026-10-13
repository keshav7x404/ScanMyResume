import { usePuterStore } from "~/lib/puter";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const Auth = () => {
    const { auth } = usePuterStore();
    const location = useLocation();
    const next = new URLSearchParams(location.search).get("next") || "/";
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (auth.isAuthenticated) navigate(next);
    }, [auth.isAuthenticated, next]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = username.trim();
        if (!trimmed) {
            setError('Please enter a username.');
            return;
        }
        auth.signIn(trimmed);
    };

    return (
        <main className="bg-[url('/images/bg-auth-new.jpg')] bg-cover min-h-screen flex items-center justify-center">
            <div className="animate-[glow_3s_ease-in-out_infinite] gradient-border shadow-lg">
                <section className="flex flex-col gap-8 rounded-2xl p-10 min-w-[340px] sm:min-w-[500px]"
                    style={{ background: 'linear-gradient(to bottom, #61045F, #AA076B)' }}>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h1 className="!text-white !bg-none" style={{ WebkitTextFillColor: 'white' }}>Welcome</h1>
                        <h2 className="text-2xl text-[#E6D5EB]">Sign in to continue your job journey</h2>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
                        <div className="form-div">
                            <label htmlFor="username">Your Name</label>
                            <input
                                id="username"
                                type="text"
                                placeholder="e.g. John Doe"
                                value={username}
                                onChange={e => { setUsername(e.target.value); setError(''); }}
                                autoFocus
                            />
                            {error && <p className="text-red-300 text-sm">{error}</p>}
                        </div>
                        <button type="submit" className="auth-button w-full text-xl mt-2">
                            Get Started
                        </button>
                    </form>
                    <p className="text-center text-[#E6D5EB] text-sm opacity-70">
                        Your data is stored locally in your browser — no account needed.
                    </p>
                </section>
            </div>
        </main>
    );
}

export default Auth;
