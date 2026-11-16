import { MOUTH_INTERIOR, type PuppetMesh } from "@/modules/avatar/puppet/mesh";

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform vec2 u_canvas;
uniform vec3 u_box;
varying vec2 v_uv;
void main() {
  vec2 px = u_box.xy + a_pos * u_box.z;
  vec2 clip = (px / u_canvas) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec4 u_color;
uniform float u_solid;
varying vec2 v_uv;
void main() {
  gl_FragColor = u_solid > 0.5 ? u_color : texture2D(u_tex, v_uv);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("shader alloc failed");
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  }
  return s;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

export type Box = { x: number; y: number; scale: number };

/** Draws a deformed puppet mesh onto a transparent canvas. */
export class PuppetRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private posBuf: WebGLBuffer;
  private uvBuf: WebGLBuffer;
  private idxBuf: WebGLBuffer;
  private mouthPosBuf: WebGLBuffer;
  private mouthIdxBuf: WebGLBuffer;
  private tex: WebGLTexture;
  private indexCount: number;
  private mouthPositions: Float32Array;
  private mouthIndexCount: number;
  private color: [number, number, number, number];
  private loc: {
    pos: number;
    uv: number;
    canvas: WebGLUniformLocation | null;
    box: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
    solid: WebGLUniformLocation | null;
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private mesh: PuppetMesh,
    image: HTMLImageElement,
    mouthColor: string,
  ) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL indisponible");
    this.gl = gl;

    const program = gl.createProgram();
    if (!program) throw new Error("program alloc failed");
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
    }
    this.program = program;
    this.loc = {
      pos: gl.getAttribLocation(program, "a_pos"),
      uv: gl.getAttribLocation(program, "a_uv"),
      canvas: gl.getUniformLocation(program, "u_canvas"),
      box: gl.getUniformLocation(program, "u_box"),
      color: gl.getUniformLocation(program, "u_color"),
      solid: gl.getUniformLocation(program, "u_solid"),
    };

    const buf = () => {
      const b = gl.createBuffer();
      if (!b) throw new Error("buffer alloc failed");
      return b;
    };
    this.posBuf = buf();
    this.uvBuf = buf();
    this.idxBuf = buf();
    this.mouthPosBuf = buf();
    this.mouthIdxBuf = buf();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.base, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.indexCount = mesh.indices.length;

    // Mouth interior: a fan around the centroid of the inner lip loop.
    const loop = MOUTH_INTERIOR;
    this.mouthPositions = new Float32Array((loop.length + 1) * 2);
    const fan: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      fan.push(0, i + 1, ((i + 1) % loop.length) + 1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mouthIdxBuf);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      Uint16Array.from(fan),
      gl.STATIC_DRAW,
    );
    this.mouthIndexCount = fan.length;
    this.color = hexToRgba(mouthColor);

    const tex = gl.createTexture();
    if (!tex) throw new Error("texture alloc failed");
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setMouthColor(hex: string) {
    this.color = hexToRgba(hex);
  }

  draw(positions: Float32Array, box: Box) {
    const { gl, loc, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    gl.uniform2f(loc.canvas, canvas.width, canvas.height);
    gl.uniform3f(loc.box, box.x, box.y, box.scale);

    const loop = MOUTH_INTERIOR;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < loop.length; i++) {
      const v = loop[i] ?? 0;
      const x = positions[v * 2] ?? 0;
      const y = positions[v * 2 + 1] ?? 0;
      this.mouthPositions[(i + 1) * 2] = x;
      this.mouthPositions[(i + 1) * 2 + 1] = y;
      mx += x;
      my += y;
    }
    this.mouthPositions[0] = mx / loop.length;
    this.mouthPositions[1] = my / loop.length;

    gl.disableVertexAttribArray(loc.uv);
    gl.vertexAttrib2f(loc.uv, 0, 0);
    gl.uniform1f(loc.solid, 1);
    gl.uniform4f(loc.color, ...this.color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mouthPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.mouthPositions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mouthIdxBuf);
    gl.drawElements(gl.TRIANGLES, this.mouthIndexCount, gl.UNSIGNED_SHORT, 0);

    gl.uniform1f(loc.solid, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(loc.uv);
    gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  get meshSize() {
    return { width: this.mesh.width, height: this.mesh.height };
  }

  dispose() {
    const { gl } = this;
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.uvBuf);
    gl.deleteBuffer(this.idxBuf);
    gl.deleteBuffer(this.mouthPosBuf);
    gl.deleteBuffer(this.mouthIdxBuf);
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.program);
  }
}
