import React from 'react';
import Svg, { Path, Circle, Rect, Polyline, Line } from 'react-native-svg';

export type IconName =
  | 'swords'
  | 'bell'
  | 'home'
  | 'search'
  | 'plus'
  | 'user'
  | 'user-round'
  | 'message-circle'
  | 'share-2'
  | 'shield-check'
  | 'clock'
  | 'wallet'
  | 'wallet-cards'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'more-horizontal'
  | 'filter'
  | 'check-circle'
  | 'alert-circle'
  | 'refresh-cw'
  | 'copy'
  | 'external-link'
  | 'check'
  | 'x'
  | 'flame'
  | 'sparkles'
  | 'trending-up'
  | 'users'
  | 'arrow-right'
  | 'trophy'
  | 'send'
  | 'info'
  | 'wifi-off'
  | 'history';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  accessibilityLabel?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  color = '#FFFFFF',
  strokeWidth = 2,
  accessibilityLabel,
}) => {
  const renderPath = () => {
    switch (name) {
      case 'swords':
        return (
          <>
            <Path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
            <Path d="M13 19l6-6" />
            <Path d="M16 16l4 4" />
            <Path d="M19 21l2-2" />
            <Path d="M9.5 6.5L21 18v3h-3L6.5 9.5" />
            <Path d="M11 5L5 11" />
            <Path d="M8 8L4 4" />
            <Path d="M5 3L3 5" />
          </>
        );
      case 'bell':
        return (
          <>
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </>
        );
      case 'home':
        return (
          <>
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <Polyline points="9 22 9 12 15 12 15 22" />
          </>
        );
      case 'search':
        return (
          <>
            <Circle cx="11" cy="11" r="8" />
            <Line x1="21" y1="21" x2="16.65" y2="16.65" />
          </>
        );
      case 'plus':
        return (
          <>
            <Line x1="12" y1="5" x2="12" y2="19" />
            <Line x1="5" y1="12" x2="19" y2="12" />
          </>
        );
      case 'user':
      case 'user-round':
        return (
          <>
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" />
          </>
        );
      case 'message-circle':
        return (
          <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        );
      case 'share-2':
        return (
          <>
            <Circle cx="18" cy="5" r="3" />
            <Circle cx="6" cy="12" r="3" />
            <Circle cx="18" cy="19" r="3" />
            <Line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <Line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </>
        );
      case 'shield-check':
        return (
          <>
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <Polyline points="9 12 11 14 15 10" />
          </>
        );
      case 'clock':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Polyline points="12 6 12 12 16 14" />
          </>
        );
      case 'wallet':
      case 'wallet-cards':
        return (
          <>
            <Path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
            <Path d="M16 3H4a2 2 0 0 0-2 2v2h18V5a2 2 0 0 0-2-2z" />
            <Circle cx="16" cy="14" r="1" />
          </>
        );
      case 'chevron-right':
        return <Polyline points="9 18 15 12 9 6" />;
      case 'chevron-left':
        return <Polyline points="15 18 9 12 15 6" />;
      case 'chevron-down':
        return <Polyline points="6 9 12 15 18 9" />;
      case 'more-horizontal':
        return (
          <>
            <Circle cx="12" cy="12" r="1" />
            <Circle cx="19" cy="12" r="1" />
            <Circle cx="5" cy="12" r="1" />
          </>
        );
      case 'filter':
        return <Polyline points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />;
      case 'check-circle':
        return (
          <>
            <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <Polyline points="22 4 12 14.01 9 11.01" />
          </>
        );
      case 'alert-circle':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Line x1="12" y1="8" x2="12" y2="12" />
            <Line x1="12" y1="16" x2="12.01" y2="16" />
          </>
        );
      case 'refresh-cw':
        return (
          <>
            <Polyline points="23 4 23 10 17 10" />
            <Polyline points="1 20 1 14 7 14" />
            <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </>
        );
      case 'copy':
        return (
          <>
            <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        );
      case 'external-link':
        return (
          <>
            <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <Polyline points="15 3 21 3 21 9" />
            <Line x1="10" y1="14" x2="21" y2="3" />
          </>
        );
      case 'check':
        return <Polyline points="20 6 9 17 4 12" />;
      case 'x':
        return (
          <>
            <Line x1="18" y1="6" x2="6" y2="18" />
            <Line x1="6" y1="6" x2="18" y2="18" />
          </>
        );
      case 'flame':
        return (
          <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        );
      case 'sparkles':
        return (
          <>
            <Path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            <Path d="M18.36 5.64l-2.12 2.12M7.76 16.24l-2.12 2.12M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12" />
          </>
        );
      case 'trending-up':
        return (
          <>
            <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <Polyline points="17 6 23 6 23 12" />
          </>
        );
      case 'users':
        return (
          <>
            <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <Circle cx="9" cy="7" r="4" />
            <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        );
      case 'arrow-right':
        return (
          <>
            <Line x1="5" y1="12" x2="19" y2="12" />
            <Polyline points="12 5 19 12 12 19" />
          </>
        );
      case 'trophy':
        return (
          <>
            <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <Path d="M4 22h16" />
            <Path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
            <Path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
          </>
        );
      case 'send':
        return (
          <>
            <Path d="m22 2-7 20-4-9-9-4Z" />
            <Path d="M22 2 11 13" />
          </>
        );
      case 'info':
        return (
          <>
            <Circle cx="12" cy="12" r="10" />
            <Path d="M12 16v-4" />
            <Path d="M12 8h.01" />
          </>
        );
      case 'wifi-off':
        return (
          <>
            <Line x1="2" y1="2" x2="22" y2="22" />
            <Path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <Path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <Path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <Path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <Path d="M5 13a10 10 0 0 1 5.24-2.76" />
            <Line x1="12" y1="20" x2="12.01" y2="20" />
          </>
        );
      case 'history':
        return (
          <>
            <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <Path d="M3 3v5h5" />
            <Path d="M12 7v5l4 2" />
          </>
        );
      default:
        return <Circle cx="12" cy="12" r="10" />;
    }
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityLabel={accessibilityLabel || `${name} icon`}
    >
      {renderPath()}
    </Svg>
  );
};
export default Icon;
