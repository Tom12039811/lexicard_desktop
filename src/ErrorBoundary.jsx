import { Component } from "react";

/* ══════════════════════════════════════════════════════════════
   ErrorBoundary — obecná pojistka proti bílé obrazovce
   Pokud kdekoliv v aplikaci dojde k neočekávané chybě při renderu,
   React jinak celou appku odmountuje (bílá obrazovka, nutný restart).
   Tahle komponenta chybu odchytí a nabídne tlačítko na znovunačtení,
   aniž by uživatel přišel o data (ta jsou v localStorage / Supabase).
══════════════════════════════════════════════════════════════ */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[LexiCard] Neočekávaná chyba v aplikaci:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100dvh",
          background: "#0b0e16",
          color: "#e8e8e8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "'Lora', Georgia, serif",
          gap: 16,
        }}>
          <div style={{ fontSize: 44 }}>⚠️</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: "#d4a853" }}>
            Něco se pokazilo
          </div>
          <div style={{ fontSize: 14, color: "#9aa0aa", maxWidth: 360, lineHeight: 1.6 }}>
            V aplikaci došlo k neočekávané chybě. Tvá slovíčka a postup jsou bezpečně uložena
            — stačí stránku znovu načíst.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              background: "#d4a853",
              color: "#1a1a1a",
              border: "none",
              borderRadius: 10,
              padding: "12px 30px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Playfair Display',serif",
            }}
          >
            Načíst znovu
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
