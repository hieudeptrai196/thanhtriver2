import * as THREE from 'three';

// Gradient sky dome with a sun (or moon) disc and halo. One draw call, no textures. Colours are authored in display
// space and blend through day, dusk and night; the horizon colour is also handed to the fog so distance melts into sky.

const KEYS = {
  day: { top: new THREE.Color(0x6a9cc6), horizon: new THREE.Color(0xd4dfdc), sun: new THREE.Color(0xfff2cc) },
  dusk: { top: new THREE.Color(0x3a4a78), horizon: new THREE.Color(0xf09a58), sun: new THREE.Color(0xffa24a) },
  night: { top: new THREE.Color(0x040812), horizon: new THREE.Color(0x14223e), sun: new THREE.Color(0xdfe6ff) },
};

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly horizon = new THREE.Color();
  readonly uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunSize: { value: 900 },
  };

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(320, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniforms,
        vertexShader: `varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec3 vDir;
          uniform vec3 uTop, uHorizon, uSunColor, uSunDir; uniform float uSunSize;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
            float d = clamp(dot(normalize(vDir), normalize(uSunDir)), 0.0, 1.0);
            col += uSunColor * (smoothstep(1.0 - 1.0 / uSunSize, 1.0, d) * 1.6 + pow(d, 10.0) * 0.28 + pow(d, 3.0) * 0.08);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** dusk 0..1 and night 0..1 blend the palettes; sunDir points at the sun (or moon at night). */
  update(camera: THREE.Camera, dusk: number, night: number, sunDir: THREE.Vector3): void {
    this.mesh.position.copy(camera.position);
    const u = this.uniforms;
    const blend = (k: 'top' | 'horizon' | 'sun', out: THREE.Color) =>
      out.copy(KEYS.day[k]).lerp(KEYS.dusk[k], dusk).lerp(KEYS.night[k], night);
    blend('top', u.uTop.value);
    blend('horizon', u.uHorizon.value);
    blend('sun', u.uSunColor.value);
    this.horizon.copy(u.uHorizon.value);
    u.uSunDir.value.copy(sunDir);
    // The moon is a smaller, sharper disc than the sun.
    u.uSunSize.value = night > 0.5 ? 2600 : 900;
  }
}
