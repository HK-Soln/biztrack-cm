type ThemeColors = {
  brand: {
    50: string;
    100: string;
    200: string;
    400: string;
    600: string;
    800: string;
    900: string;
  };
  primary: string;
  "primary-dark": string;
  success: {
    50: string;
    400: string;
    800: string;
  };
  warning: {
    50: string;
    400: string;
    800: string;
  };
  danger: {
    50: string;
    400: string;
    800: string;
  };
  neutral: {
    50: string;
    100: string;
    400: string;
    800: string;
  };
};

type ThemeRadius = {
  card: number;
  cardLg: number;
  input: number;
  btn: number;
  hero: number;
  icon: number;
};

declare const theme: {
  colors: ThemeColors;
  radius: ThemeRadius;
};

export default theme;
