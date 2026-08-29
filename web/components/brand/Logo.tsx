import Image from "next/image";
import logo from "@/public/logo.png";

/*
  The A mark, used verbatim from references/logo.jpeg. The only processing
  applied was a crop and a luminance key that turns the artwork's black
  field transparent; composited over the page's pure-black ground it is
  pixel-identical to the supplied file.
*/
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src={logo}
      alt=""
      aria-hidden="true"
      priority
      sizes="128px"
      className={className}
    />
  );
}
