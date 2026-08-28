/**
 * Кружок аватара: картинка или первая буква имени на зелёном фоне — тот же
 * приём и те же цвета, что в мобильном вебе.
 */
export function Avatar({
  src,
  name,
  size = 40,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (src) {
    return <img src={src} alt={name} style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-700"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
