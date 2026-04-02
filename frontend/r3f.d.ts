// Three.js / R3F JSX-Elemente für TypeScript
// export {} macht dies zu einem Modul → declare module erweitert statt ersetzt
export {};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      // Kern
      group: any;
      primitive: any;
      // Geometrien
      bufferGeometry: any;
      bufferAttribute: any;
      sphereGeometry: any;
      boxGeometry: any;
      cylinderGeometry: any;
      planeGeometry: any;
      // Meshes & Points
      mesh: any;
      points: any;
      line: any;
      // Materialien
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      meshPhongMaterial: any;
      pointsMaterial: any;
      lineBasicMaterial: any;
      // Lichter
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      spotLight: any;
      hemisphereLight: any;
    }
  }
}
