'use client';

import { useEffect, useRef } from 'react';

export default function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cvs = canvas;
    function syncSize() {
      const w = cvs.clientWidth || 1280;
      const h = cvs.clientHeight || 720;
      if (cvs.width !== w || cvs.height !== h) {
        cvs.width = w;
        cvs.height = h;
      }
    }
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(syncSize).observe(cvs);
    }
    syncSize();

    const ctx = cvs.getContext('webgl') || cvs.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!ctx) return;
    const gl: WebGLRenderingContext = ctx;

    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

    const fs = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
varying vec2 v_texCoord;

void main() {
    vec2 uv = v_texCoord;
    vec2 mouse = u_mouse / u_resolution;
    
    vec3 color = vec3(0.039, 0.055, 0.094);
    
    vec2 grid = fract(uv * 40.0 + u_time * 0.05);
    float line = smoothstep(0.02, 0.0, abs(grid.x - 0.5)) + smoothstep(0.02, 0.0, abs(grid.y - 0.5));
    color += line * 0.02;

    for(float i = 0.0; i < 3.0; i++) {
        float speed = 0.5 + i * 0.2;
        float offset = i * 2.0;
        float pulse = sin(uv.x * 3.0 + u_time * speed + offset) * 0.1;
        float dist = abs(uv.y - 0.5 + pulse);
        
        vec3 accent = vec3(0.82, 0.94, 0.0);
        float glow = smoothstep(0.15, 0.0, dist);
        color += accent * glow * 0.15;
    }
    
    float mDist = distance(uv, mouse);
    color += vec3(0.82, 0.94, 0.0) * (smoothstep(0.2, 0.0, mDist) * 0.1);

    gl_FragColor = vec4(color, 1.0);
}`;

    function cs(type: number, src: string) {
      const s = gl.createShader(type);
      if (!s) return s;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const prog = gl.createProgram();
    if (!prog) return;

    const vsShader = cs(gl.VERTEX_SHADER, vs);
    const fsShader = cs(gl.FRAGMENT_SHADER, fs);
    if (!vsShader || !fsShader) return;

    gl.attachShader(prog, vsShader);
    gl.attachShader(prog, fsShader);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    let mouse = { x: cvs.width / 2, y: cvs.height / 2 };
    const handleMouseMove = (event: MouseEvent) => {
      const rect = cvs.getBoundingClientRect();
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = 1.0 - (event.clientY - rect.top) / rect.height;
        mouse.x = nx * cvs.width;
        mouse.y = ny * cvs.height;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    let animId: number;

    function render(t: number) {
      if (typeof ResizeObserver === 'undefined') syncSize();
      gl.viewport(0, 0, cvs.width, cvs.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, cvs.width, cvs.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(render);
    }
    render(0);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-0 opacity-40"
      style={{ display: 'block' }}
    />
  );
}
