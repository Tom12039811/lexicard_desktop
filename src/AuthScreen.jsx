import { useState } from "react";
import { supabase } from "./supabase.js";
import { C, STYLE } from "./constants.js";

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit() {
    setError("");
    setInfo("");
    if (mode === "forgot") {
      if (!email) { setError("Vyplň emailovou adresu."); return; }
      setLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "?reset=1",
        });
        if (error) throw error;
        setInfo("Email odeslán! Zkontroluj svoji schránku a klikni na odkaz pro obnovu hesla.");
      } catch (e) {
        setError(translateError(e.message));
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!email || !password) { setError("Vyplň email a heslo."); return; }
    if (mode === "register" && !username.trim()) { setError("Vyplň uživatelské jméno."); return; }
    if (password.length < 6) { setError("Heslo musí mít alespoň 6 znaků."); return; }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } }
        });
        if (error) throw error;
        if (data?.user && !data.session) {
          setInfo("Zkontroluj email a potvrď registraci.");
        }
      }
    } catch (e) {
      setError(translateError(e.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGitHub() {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin }
    });
    if (error) setError(error.message);
  }

  function translateError(msg) {
    if (msg.includes("Invalid login credentials")) return "Spatny email nebo heslo.";
    if (msg.includes("Email not confirmed")) return "Email neni potvrzeny. Zkontroluj schranku.";
    if (msg.includes("User already registered")) return "Tento email je jiz registrovan.";
    if (msg.includes("Password should be")) return "Heslo musi mit alespon 6 znaku.";
    return msg;
  }

  const inp = {
    width: "100%",
    padding: "0.7rem 1rem",
    borderRadius: 10,
    border: "1px solid var(--lc-cardSubBorder)",
    background: "var(--lc-cardAlt)",
    color: "var(--lc-text)",
    fontSize: 15,
    fontFamily: "system-ui, sans-serif",
    boxSizing: "border-box",
    outline: "none",
  };

  const isForgot = mode === "forgot";

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--lc-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <style>{STYLE}</style>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: 48, marginBottom: "0.5rem" }}>🃏</div>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 34,
          fontWeight: 700,
          color: C.gold,
          letterSpacing: "-1px",
        }}>LexiCard</div>
        <div style={{ color: "var(--lc-textDim)", fontSize: 14, marginTop: 4 }}>
          Uc se slovicka chytre
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: "var(--lc-card)",
        border: "1px solid var(--lc-cardSubBorder)",
        borderRadius: 20,
        padding: "2rem",
        width: "100%",
        maxWidth: 400,
      }}>
        {isForgot ? (
          /* ── Forgot password view ── */
          <>
            <div style={{ marginBottom: "1.25rem" }}>
              <button
                className="btn"
                onClick={() => { setMode("login"); setError(""); setInfo(""); }}
                style={{ color: "var(--lc-textDim)", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
              >
                ← Zpet na prihlaseni
              </button>
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: C.gold, marginBottom: "0.4rem" }}>Obnova hesla</div>
            <div style={{ fontSize: 13, color: "var(--lc-textDim)", marginBottom: "1.25rem", lineHeight: 1.5 }}>
              Zadej svuj email a poslem ti odkaz pro nastaveni noveho hesla.
            </div>
            <input
              style={inp}
              type="email"
              placeholder="Tvuj email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
            {error && (
              <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.9rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>
            )}
            {info && (
              <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.9rem", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#4ade80", fontSize: 13 }}>{info}</div>
            )}
            <button
              className="btn"
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: "100%", marginTop: "1rem", padding: "0.8rem", borderRadius: 12, background: C.gold, color: "#fff", fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Odesílám…" : "Odeslat odkaz"}
            </button>
          </>
        ) : (
          /* ── Login / Register view ── */
          <>
            {/* Tab switcher */}
            <div style={{ display: "flex", background: "var(--lc-cardAlt)", borderRadius: 10, padding: 4, marginBottom: "1.5rem" }}>
              {["login", "register"].map(m => (
                <button
                  key={m}
                  className="btn"
                  onClick={() => { setMode(m); setError(""); setInfo(""); }}
                  style={{
                    flex: 1, padding: "0.5rem", borderRadius: 8, fontSize: 14, fontWeight: 600,
                    background: mode === m ? C.gold : "transparent",
                    color: mode === m ? "#fff" : "var(--lc-textDim)",
                    transition: "all .2s",
                  }}
                >{m === "login" ? "Prihlasit se" : "Registrovat"}</button>
              ))}
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {mode === "register" && (
                <input
                  style={inp}
                  placeholder="Uzivatelske jmeno"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                />
              )}
              <input
                style={inp}
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
              <input
                style={inp}
                type="password"
                placeholder="Heslo (min. 6 znaku)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </div>

            {/* Forgot password link — only on login */}
            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: "0.5rem" }}>
                <button
                  className="btn"
                  onClick={() => { setMode("forgot"); setError(""); setInfo(""); }}
                  style={{
                    fontSize: 12,
                    color: "var(--lc-textDim)",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    padding: 0,
                  }}
                >
                  Zapomnel jsem heslo
                </button>
              </div>
            )}

            {/* Error / Info */}
            {error && (
              <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.9rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: 13 }}>{error}</div>
            )}
            {info && (
              <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.9rem", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, color: "#4ade80", fontSize: 13 }}>{info}</div>
            )}

            {/* Submit */}
            <button
              className="btn"
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: "100%", marginTop: "1rem", padding: "0.8rem", borderRadius: 12, background: C.gold, color: "#fff", fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Nacitam…" : mode === "login" ? "Prihlasit se" : "Vytvorit ucet"}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0", color: "var(--lc-textDim)", fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--lc-cardSubBorder)" }} />
              nebo
              <div style={{ flex: 1, height: 1, background: "var(--lc-cardSubBorder)" }} />
            </div>

            {/* GitHub */}
            <button
              className="btn"
              onClick={handleGitHub}
              style={{ width: "100%", padding: "0.75rem", borderRadius: 12, background: "var(--lc-cardAlt)", border: "1px solid var(--lc-cardSubBorder)", color: "var(--lc-text)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02.005 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Prihlasit pres GitHub
            </button>
          </>
        )}
      </div>
    </div>
  );
}
