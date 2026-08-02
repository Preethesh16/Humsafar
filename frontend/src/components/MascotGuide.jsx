import mascot from "../assets/humsafar-cat.png";

export function MascotGuide({ message, label = "Milo · your route cat", compact = false, stage = false }) {
  const classes = ["mascot-guide", compact && "compact", stage && "stage"].filter(Boolean).join(" ");
  return (
    <aside className={classes} aria-label="Travel assistant">
      <div className="mascot-portrait">
        <span className="mascot-halo" aria-hidden="true" />
        <img src={mascot} alt="Milo, Humsafar's cat travel concierge, holding a route map" />
      </div>
      <div className="mascot-speech">
        <span>{label}</span>
        <p>{message}</p>
      </div>
    </aside>
  );
}
