import mascot from "../assets/humsafar-cat.png";

export function MascotGuide({ message, label = "Milo · your route cat", compact = false }) {
  return (
    <aside className={`mascot-guide ${compact ? "compact" : ""}`} aria-label="Travel assistant">
      <img src={mascot} alt="Milo, Humsafar's cat travel concierge, holding a route map" />
      <div>
        <span>{label}</span>
        <p>{message}</p>
      </div>
    </aside>
  );
}
