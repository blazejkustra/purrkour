import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

/** House — leave the level, back to the menu. */
export function HomeIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 11l9-8 9 8" />
      <Path d="M5.5 9.5V20h4.6v-5.4h3.8V20h4.6V9.5" />
    </Svg>
  );
}

/** Undo — arrow curling back. */
export function UndoIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M8.5 4.5L4 9l4.5 4.5" />
      <Path d="M4 9h9.5a6 6 0 016 6v0a6 6 0 01-6 6H9" />
    </Svg>
  );
}

/** Reset — circular refresh. */
export function ResetIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M20.5 4.5V10H15" />
      <Path d="M3.5 19.5V14H9" />
      <Path d="M4.6 9a8 8 0 0113.2-3l2.7 4M19.4 15a8 8 0 01-13.2 3l-2.7-4" />
    </Svg>
  );
}

/** Lightbulb — hint. */
export function HintIcon({ size = 24, color = '#fff' }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 2.8a6.2 6.2 0 00-3.6 11.2c.7.55 1.2 1.3 1.4 2.2h4.4c.2-.9.7-1.65 1.4-2.2A6.2 6.2 0 0012 2.8z" />
      <Path d="M9.8 19.4h4.4" />
      <Path d="M10.6 21.8h2.8" />
    </Svg>
  );
}

/** Eighth-note pair; `muted` draws a slash through it. */
export function MusicIcon({
  size = 24,
  color = '#fff',
  muted = false,
  slashColor = '#b85a3c',
}: IconProps & { muted?: boolean; slashColor?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 17.5V6.2l10-2v11.3"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={6.6} cy={17.6} r={2.6} fill={color} />
      <Circle cx={16.6} cy={15.6} r={2.6} fill={color} />
      {muted && (
        <Path
          d="M4 3.5L20.5 20"
          stroke={slashColor}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}
