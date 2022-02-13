export const fragment = {
  source: `
          vec4 LGL_An(sampler2D map, vec2 uv) {
          #ifdef OES_texture_float_linear
              return texture(map, uv);
          #else
              vec2 size = vec2(textureSize(map, 0));
              vec2 texelSize = 1.0 / size;
              uv = uv * size - 0.5;
              vec2 f = fract(uv);
              uv = floor(uv) + 0.5;
              vec4 s1 = texture(map, (uv + vec2(0, 0)) * texelSize);
              vec4 s2 = texture(map, (uv + vec2(1, 0)) * texelSize);
              vec4 s3 = texture(map, (uv + vec2(0, 1)) * texelSize);
              vec4 s4 = texture(map, (uv + vec2(1, 1)) * texelSize);
              return mix(mix(s1, s2, f.x), mix(s3, s4, f.x), f.y);
          #endif
          }
          layout(location = 0) out vec4 out_color;
          in vec2 vCoord;
          uniform sampler2D lightTex;
          uniform vec2 lightScale;
          uniform int toneMappingFun;
          vec3 linear(vec3 color) {
              return color;
          }
          vec3 LGL_Av(vec3 color) {
              return clamp(color / (vec3(1.0) + color), vec3(0.0), vec3(1.0));
          }
          vec3 LGL_Aw(vec3 color) {
              color = max(vec3(0.0), color - 0.004);
              return pow((color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06), vec3(2.2));
          }
          vec3 LGL_Ax(vec3 color) {
              return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
          }
          void main() {
              vec4 upscaledLight = texture(lightTex, lightScale * vCoord);
              vec3 light = upscaledLight.rgb / upscaledLight.a;
              if(toneMappingFun == 0) {
                  light = linear(light);
              }
              if(toneMappingFun == 1) {
                  light = LGL_Ax(light);
              }
              if(toneMappingFun == 2) {
                  light = LGL_Av(light);
              }
              if(toneMappingFun == 3) {
                  light = LGL_Aw(light);
              }
              light = pow(light, vec3(1.0 / 2.2));
              if(upscaledLight.a == 0.) {
                  out_color = vec4(light, 0.0);
              } else {
                  out_color = vec4(light, 1.0);
              }
          }
    `,
};
