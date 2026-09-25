import type { ImgHTMLAttributes } from "react";
export default function WaffleIcon({
  size = 24,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { size?: number }) {
  return (
    <img
      src="/waffle-icon-192.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="waffle-artwork"
      {...props}
    />
  );
}
