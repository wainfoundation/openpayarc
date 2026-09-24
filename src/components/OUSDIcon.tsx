/**
 * OUSDIcon — OpenPay OpenUSD token logo.
 * Matches the provided brand asset: royal blue circle, two overlapping
 * "O" rings — a left semi-transparent blue crescent + a right white ring.
 */
export default function OUSDIcon({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Clip the left ring to only show its right-side crescent */}
        <clipPath id="ousd-left-clip">
          <rect x="0" y="0" width="58" height="100" />
        </clipPath>
        {/* Clip everything to the background circle */}
        <clipPath id="ousd-circle-clip">
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>

      {/* Background */}
      <circle cx="50" cy="50" r="50" fill="#0D47D1" />

      {/* Left "O" ring — semi-transparent light blue, clipped to crescent */}
      <g clipPath="url(#ousd-circle-clip)">
        {/* Full left ring (semi-transparent) shown through clip */}
        <circle
          cx="40" cy="50" r="21"
          fill="none"
          stroke="rgba(147,180,255,0.72)"
          strokeWidth="12"
        />

        {/* Right "O" ring — white, drawn on top */}
        <circle
          cx="59" cy="50" r="21"
          fill="none"
          stroke="white"
          strokeWidth="12"
        />

        {/* Intersection blend — where right white ring overlaps left blue ring,
            paint a lighter blue so the overlap reads as translucent */}
        <circle
          cx="59" cy="50" r="21"
          fill="none"
          stroke="rgba(100,150,255,0.55)"
          strokeWidth="12"
          clipPath="url(#ousd-left-clip)"
        />
      </g>
    </svg>
  )
}
