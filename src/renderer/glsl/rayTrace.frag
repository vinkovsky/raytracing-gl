import { unrollLoop } from '../glslUtil';

import constants from './chunks/constants.glsl';

export default {
  includes: [constants],
  outputs: ['light'],
  source: (e) => `
     #define RAYTRACEMTL 0

      const vec3 luminance = vec3(0.2126, 0.7152, 0.0722);

      float LGL_AV(vec3 color) {
          return dot(color, luminance);
      }

      #define RAY_MAX_DISTANCE 9999.0

      struct Ray {
          vec3 o;
          vec3 d;
          vec3 invD;
          float tMax;
      };

      struct Path {
          Ray ray;
          vec3 li;
          float alpha;
          vec3 beta;
          bool LGL_BQ;
          float LGL_BR;
          vec3 LGL_BS;
      };

      struct Camera {
          mat4 transform;
          float aspect;
          float fov;
          float focus;
          float aperture;
      };

      #if defined(NUM_LIGHTS)
        struct Lights {
            vec3 position[NUM_LIGHTS];
            vec3 emission[NUM_LIGHTS];
            vec3 p1[NUM_LIGHTS];
            vec3 p2[NUM_LIGHTS];
            vec4 params[NUM_LIGHTS];
        };

        struct Light {
            vec3 position;
            vec3 emission;
            vec3 p1;
            vec3 p2;
            float radius;
            float area;
            float type;
            float visible;
        };
      #endif

      struct SurfaceInteraction {
          bool hit;
          bool LGL_BI;
          float t;
          vec3 position;
          vec3 normal;
          vec3 faceNormal;
          vec3 LGL_BL;
          vec3 tangent;
          vec3 bitangent;
          vec3 color;
          vec3 extinction;
          vec3 emissive;
          int LGL_BH;
          float roughness;
          float metalness;
          float LGL_BF;
          float LGL_BB;
          float LGL_Ay;
          float sheen;
          float LGL_Az;
          float clearcoat;
          float LGL_BA;
          float LGL_BC;
          float ior;
          float LGL_BE;
          float eta;
          float LGL_BD;
          vec3 specularColor;
          float LGL_BG;
      };

      struct BsdfSampleRec {
          vec3 L;
          vec3 f;
          float pdf;
      };

      struct LightSampleRec {
          vec3 normal;
          vec3 emission;
          vec3 direction;
          float dist;
          float pdf;
      };

      void initRay(inout Ray ray, vec3 origin, vec3 direction) {
          ray.o = origin;
          ray.d = direction;
          ray.invD = 1.0 / ray.d;
          ray.tMax = RAY_MAX_DISTANCE;
      }

      void initRay(inout Ray ray, vec3 origin, vec3 direction, float rMax) {
          ray.o = origin;
          ray.d = direction;
          ray.invD = 1.0 / ray.d;
          ray.tMax = rMax;
      }

      ivec2 unpackTexel(int i, int LGL_BT) {
          ivec2 u;
          u.y = i >> LGL_BT;
          u.x = i - (u.y << LGL_BT);
          return u;
      }

      vec4 fetchData(sampler2D s, int i, int LGL_BT) {
          return texelFetch(s, unpackTexel(i, LGL_BT), 0);
      }

      ivec4 fetchData(isampler2D s, int i, int LGL_BT) {
          return texelFetch(s, unpackTexel(i, LGL_BT), 0);
      }

      uniform Camera camera;
      uniform vec2 pixelSize;
      uniform vec2 jitter;
      uniform float frameCount;
      in vec2 vCoord;

      #if defined(NUM_LIGHTS)
        uniform Lights lights;
      #endif

      uniform int bounces;
      uniform vec3 backgroundColor;
      uniform float envMapIntensity;
      uniform float enviromentVisible;
      uniform sampler2D noiseTex;
      uniform float stratifiedSamples[71];
      uniform float strataSize;
      float pixelSeed;

      float LGL_AN(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      uvec4 seed;
      ivec2 pixel;

      void LGL_AO(float frame) {
          pixel = ivec2(vCoord / pixelSize);
          seed = uvec4(pixel, int(frame), pixel.x + pixel.y);
      }

      void LGL_AP(inout uvec4 v) {
          v = v * 1664525u + 1013904223u;
          v.x += v.y * v.w;
          v.y += v.z * v.x;
          v.z += v.x * v.y;
          v.w += v.y * v.z;
          v = v ^ (v >> 16u);
          v.x += v.y * v.w;
          v.y += v.z * v.x;
          v.z += v.x * v.y;
          v.w += v.y * v.z;
      }

      float LGL_AQ() {
          LGL_AP(seed);
          return float(seed.x) / float(0xffffffffu);
      }

      vec2 LGL_AQ2() {
          LGL_AP(seed);
          return vec2(seed.xy) / float(0xffffffffu);
      }

      void LGL_AS(float frame) {
          vec2 noiseSize = vec2(textureSize(noiseTex, 0));
          pixelSeed = texture(noiseTex, vCoord / (pixelSize * noiseSize)).r;
          LGL_AO(frame);
      }

      int sampleIndex = 0;

      float LGL_AQomSample() {
          float stratifiedSample = stratifiedSamples[sampleIndex++];
          float LGL_AQom = fract((stratifiedSample + pixelSeed) * strataSize);
          return EPS + (1.0 - 2.0 * EPS) * LGL_AQom;
      }

      vec2 LGL_AQomSampleVec2() {
          return vec2(LGL_AQomSample(), LGL_AQomSample());
      }

      struct MaterialSamples {
          vec2 s1;
          vec2 s2;
          vec2 s3;
          vec2 s4;
      };

      MaterialSamples getRandomMaterialSamples() {
          MaterialSamples samples;
          samples.s1 = LGL_AQomSampleVec2();
          samples.s2 = LGL_AQomSampleVec2();
          samples.s3 = LGL_AQomSampleVec2();
          samples.s4 = LGL_AQomSampleVec2();
          return samples;
      }

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
      uniform Materials {
          vec4 colorAndMaterialType[NUM_MATERIALS];
          vec4 roughnessMetalnessNormalScale[NUM_MATERIALS];
          vec4 alphaSpecularTintSheenSheenTint[NUM_MATERIALS];
          vec4 clearcoaRoughnessSubfaceTransmission[NUM_MATERIALS];
          vec4 iorAtDistanceAnisotropicWorkflow[NUM_MATERIALS];
          vec4 extinction[NUM_MATERIALS];
          vec4 specularColorGlossiness[NUM_MATERIALS];
      #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)
          ivec4 diffuseNormalRoughnessMetalnessMapIndex[NUM_MATERIALS];
      #endif
      #if defined(NUM_EMISSIVE_MAPS) || defined(NUM_PBR_SG_MAPS)
          ivec4 emissiveSpecularGlossinessMapIndex[NUM_MATERIALS];
      #endif
      #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS)
          vec4 diffuseNormalMapSize[NUM_DIFFUSE_NORMAL_MAPS];
      #endif
      #if defined(NUM_PBR_MAPS)
          vec2 pbrMapSize[NUM_PBR_MAPS];
      #else
      #if defined(NUM_PBR_SG_MAPS)
          vec2 pbrMapSize[NUM_PBR_SG_MAPS];
      #else
      #if defined(NUM_EMISSIVE_MAPS)
          vec2 pbrMapSize[NUM_EMISSIVE_MAPS];
      #endif
      #endif
      #endif
      } materials;
      #ifdef NUM_DIFFUSE_MAPS
      uniform mediump sampler2DArray diffuseMap;
      #endif
      #ifdef NUM_NORMAL_MAPS
      uniform mediump sampler2DArray normalMap;
      #endif
      #ifdef NUM_PBR_MAPS
      uniform mediump sampler2DArray pbrMap;
      #endif
      #ifdef NUM_PBR_SG_MAPS
      uniform mediump sampler2DArray pbrSGMap;
      #endif
      #ifdef NUM_EMISSIVE_MAPS
      uniform mediump sampler2DArray emissiveMap;
      #endif
      float LGL_p(int materialIndex) {
          return materials.colorAndMaterialType[materialIndex].w;
      }
      float LGL_q(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;
      }
      vec3 LGL_r(int materialIndex, vec2 uv) {
          vec3 emissive = vec3(0.0);
      #ifdef NUM_EMISSIVE_MAPS
          int emissiveMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;
          if(emissiveMapIndex >= 0) {
              emissive = texture(emissiveMap, vec3(uv * materials.pbrMapSize[emissiveMapIndex].xy, emissiveMapIndex)).rgb;
          }
      #endif
          return emissive;
      }
      vec3 LGL_s(int materialIndex, vec2 uv) {
          vec3 specularColor = materials.specularColorGlossiness[materialIndex].rgb;
      #ifdef NUM_PBR_SG_MAPS
          int specularMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].y;
          if(specularMapIndex >= 0) {
              vec3 texelSpecular = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[specularMapIndex].xy, specularMapIndex)).rgb;
              texelSpecular = pow(texelSpecular, vec3(2.2));
              specularColor *= texelSpecular;
          }
      #endif
          return specularColor;
      }
      float LGL_t(int materialIndex, vec2 uv) {
          float glossiness = materials.specularColorGlossiness[materialIndex].a;
      #ifdef NUM_PBR_SG_MAPS
          int glossinessMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].z;
          if(glossinessMapIndex >= 0) {
              float texelGlossiness = texture(pbrSGMap, vec3(uv * materials.pbrMapSize[glossinessMapIndex].xy, glossinessMapIndex)).a;
              glossiness *= texelGlossiness;
          }
      #endif
          return glossiness;
      }
      float LGL_u(int materialIndex, vec2 uv) {
          float LGL_BG = LGL_q(materialIndex);
          float roughness = 0.0;
          if(LGL_BG > 0.1) {
              roughness = 1.0 - LGL_t(materialIndex, uv);
          } else {
              roughness = materials.roughnessMetalnessNormalScale[materialIndex].x;
      #ifdef NUM_PBR_MAPS
              int roughnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;
              if(roughnessMapIndex >= 0) {
                  roughness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[roughnessMapIndex].xy, roughnessMapIndex)).g;
              }
      #endif
          }
          return roughness * roughness;
      }
      float LGL_v(const vec3 v) {
          return max(v.x, max(v.y, v.z));
      }
      float LGL_w(const vec3 specularColor) {
          return LGL_v(specularColor);
      }
      vec3 LGL_x(const vec3 baseColor, float metallic) {
          return baseColor * (1.0 - metallic);
      }
      float LGL_y(int materialIndex, vec2 uv) {
          float LGL_BG = LGL_q(materialIndex);
          float metalness = 0.0;
          if(LGL_BG > 0.1) {
              vec3 specularFactor = LGL_s(materialIndex, uv);
              metalness = LGL_w(specularFactor);
          } else {
              metalness = materials.roughnessMetalnessNormalScale[materialIndex].y;
      #ifdef NUM_PBR_MAPS
              int metalnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].w;
              if(metalnessMapIndex >= 0) {
                  metalness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[metalnessMapIndex].xy, metalnessMapIndex)).b;
              }
      #endif
          }
          return metalness;
      }
      vec3 LGL_z(int materialIndex, vec2 uv) {
          vec3 color = materials.colorAndMaterialType[materialIndex].rgb;
      #ifdef NUM_DIFFUSE_MAPS
          int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
          if(diffuseMapIndex >= 0) {
              color *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).rgb;
          }
      #endif
          float LGL_BG = LGL_q(materialIndex);
          if(LGL_BG > 0.1) {
              vec3 specularFactor = LGL_s(materialIndex, uv);
              color = LGL_x(color, LGL_w(specularFactor));
          }
          return color;
      }
      vec3 LGL_AA(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2, inout vec3 tangent, inout vec3 bitangent) {
          vec3 dp2perp = cross(dp2, normal);
          vec3 dp1perp = cross(normal, dp1);
          vec3 dpdu = dp2perp * duv1.x + dp1perp * duv2.x;
          vec3 dpdv = dp2perp * duv1.y + dp1perp * duv2.y;
          float invmax = inversesqrt(max(dot(dpdu, dpdu), dot(dpdv, dpdv)));
          dpdu *= invmax;
          dpdv *= invmax;
          tangent = normalize(dpdu);
          bitangent = normalize(dpdv);
      #ifdef NUM_NORMAL_MAPS
          int normalMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].y;
          if(normalMapIndex >= 0) {
              vec3 n = 2.0 * texture(normalMap, vec3(uv * materials.diffuseNormalMapSize[normalMapIndex].zw, normalMapIndex)).rgb - 1.0;
              n.xy *= materials.roughnessMetalnessNormalScale[materialIndex].zw;
              mat3 tbn = mat3(dpdu, dpdv, normal);
              return normalize(tbn * n);
          } else {
              return normal;
          }
      #endif
          return normal;
      }
      float LGL_AD(int materialIndex, vec2 uv) {
          float alpha = materials.alphaSpecularTintSheenSheenTint[materialIndex].x;
      #ifdef NUM_DIFFUSE_MAPS
          int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
          if(diffuseMapIndex >= 0) {
              alpha *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).a;
          }
      #endif
          return alpha;
      }
      float LGL_AB(int materialIndex) {
          return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;
      }
      float LGL_AC(int materialIndex) {
          return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;
      }
      float LGL_ACTint(int materialIndex) {
          return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;
      }
      float LGL_AF(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;
      }
      float LGL_AFRoughness(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;
      }
      float LGL_AH(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;
      }
      float LGL_AI(int materialIndex) {
          return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;
      }
      float LGL_AJ(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;
      }
      float LGL_AK(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;
      }
      float LGL_AL(int materialIndex) {
          return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;
      }
      vec3 LGL_AM(int materialIndex) {
          return materials.extinction[materialIndex].rgb;
      }
      uniform sampler2D positionBuffer;
      uniform sampler2D normalBuffer;
      uniform sampler2D uvBuffer;
      uniform sampler2D bvhBuffer;
      struct Triangle {
          vec3 p0;
          vec3 p1;
          vec3 p2;
      };
      struct Box {
          vec3 min;
          vec3 max;
      };
      struct TriangleIntersect {
          float t;
          vec3 barycentric;
      };
      float LGL_f(float rad, vec3 pos, Ray r) {
          vec3 op = pos - r.o;
          float eps = 0.001;
          float b = dot(op, r.d);
          float det = b * b - dot(op, op) + rad * rad;
          if(det < 0.0)
              return INF;
          det = sqrt(det);
          float t1 = b - det;
          if(t1 > eps)
              return t1;
          float t2 = b + det;
          if(t2 > eps)
              return t2;
          return INF;
      }
      float LGL_g(in vec3 pos, in vec3 u, in vec3 v, in vec4 plane, in Ray r) {
          vec3 n = vec3(plane);
          float dt = dot(r.d, n);
          float t = (plane.w - dot(n, r.o)) / dt;
          if(t > EPS) {
              vec3 p = r.o + r.d * t;
              vec3 vi = p - pos;
              float a1 = dot(u, vi);
              if(a1 >= 0. && a1 <= 1.) {
                  float a2 = dot(v, vi);
                  if(a2 >= 0. && a2 <= 1.)
                      return t;
              }
          }
          return INF;
      }
      float LGL_h(vec3 v0, vec3 v1, vec3 v2, Ray r, bool isDoubleSided) {
          vec3 edge1 = v1 - v0;
          vec3 edge2 = v2 - v0;
          vec3 pvec = cross(r.d, edge2);
          float det = 1.0 / dot(edge1, pvec);
          if(!isDoubleSided && det < 0.0)
              return INF;
          vec3 tvec = r.o - v0;
          float u = dot(tvec, pvec) * det;
          vec3 qvec = cross(tvec, edge1);
          float v = dot(r.d, qvec) * det;
          float t = dot(edge2, qvec) * det;
          return (u < 0.0 || u > 1.0 || v < 0.0 || u + v > 1.0 || t <= 0.0) ? INF : t;
      }
      float LGL_gClassic(vec3 v1, vec3 v2, vec3 v3, vec3 v4, Ray r, bool isDoubleSided) {
          return min(LGL_h(v1, v3, v2, r, isDoubleSided), LGL_h(v2, v3, v4, r, isDoubleSided));
      }
      void surfaceInteractionFromBVH(inout SurfaceInteraction si, Triangle tri, vec3 barycentric, ivec3 index, vec3 faceNormal, int materialIndex) {
          si.hit = true;
          si.faceNormal = faceNormal;
          si.position = barycentric.x * tri.p0 + barycentric.y * tri.p1 + barycentric.z * tri.p2;
          ivec2 i0 = unpackTexel(index.x, VERTEX_COLUMNS);
          ivec2 i1 = unpackTexel(index.y, VERTEX_COLUMNS);
          ivec2 i2 = unpackTexel(index.z, VERTEX_COLUMNS);
          vec3 n0 = texelFetch(normalBuffer, i0, 0).xyz;
          vec3 n1 = texelFetch(normalBuffer, i1, 0).xyz;
          vec3 n2 = texelFetch(normalBuffer, i2, 0).xyz;
          vec3 normal = normalize(barycentric.x * n0 + barycentric.y * n1 + barycentric.z * n2);
          vec2 uv0 = texelFetch(uvBuffer, i0, 0).xy;
          vec2 uv1 = texelFetch(uvBuffer, i1, 0).xy;
          vec2 uv2 = texelFetch(uvBuffer, i2, 0).xy;
      #if defined(NUM_DIFFUSE_MAPS) || defined(NUM_NORMAL_MAPS) || defined(NUM_PBR_MAPS)
          vec2 uv = fract(barycentric.x * uv0 + barycentric.y * uv1 + barycentric.z * uv2);
      #else
          vec2 uv = vec2(0.0);
      #endif
          si.LGL_BH = int(LGL_p(materialIndex));
          si.color = LGL_z(materialIndex, uv);
          si.roughness = LGL_u(materialIndex, uv);
          si.metalness = LGL_y(materialIndex, uv);
          si.specularColor = LGL_s(materialIndex, uv);
          si.LGL_BG = LGL_q(materialIndex);
          si.emissive = LGL_r(materialIndex, uv);
          vec3 dp1 = tri.p0 - tri.p2;
          vec3 dp2 = tri.p1 - tri.p2;
          vec2 duv1 = uv0 - uv2;
          vec2 duv2 = uv1 - uv2;
          si.normal = LGL_AA(materialIndex, uv, normal, dp1, dp2, duv1, duv2, si.tangent, si.bitangent);
          si.LGL_Ay = LGL_AB(materialIndex);
          si.sheen = LGL_AC(materialIndex);
          si.LGL_Az = LGL_ACTint(materialIndex);
          si.clearcoat = LGL_AF(materialIndex);
          si.LGL_BA = LGL_AFRoughness(materialIndex);
          si.LGL_BB = LGL_AH(materialIndex);
          si.LGL_BC = LGL_AI(materialIndex);
          si.LGL_BD = LGL_AD(materialIndex, uv);
          si.ior = LGL_AJ(materialIndex);
          si.LGL_BE = LGL_AK(materialIndex);
          si.LGL_BF = LGL_AL(materialIndex);
          si.extinction = LGL_AM(materialIndex);
      }
      TriangleIntersect LGL_k(Ray r, Triangle tri) {
          vec3 v0 = tri.p0;
          vec3 v1 = tri.p1;
          vec3 v2 = tri.p2;
          TriangleIntersect ti;
          vec3 e0 = v1 - v0;
          vec3 e1 = v2 - v0;
          vec3 pv = cross(r.d, e1);
          float det = dot(e0, pv);
          vec3 tv = r.o - v0;
          vec3 qv = cross(tv, e0);
          vec4 uvt;
          uvt.x = dot(tv, pv);
          uvt.y = dot(r.d, qv);
          uvt.z = dot(e1, qv);
          uvt.xyz = uvt.xyz / det;
          uvt.w = 1.0 - uvt.x - uvt.y;
          if(uvt.z >= r.tMax) {
              return ti;
          }
          if(all(greaterThanEqual(uvt, vec4(0.0))) && uvt.z < INF) {
              ti.t = uvt.z;
              ti.barycentric = uvt.wxy;
          }
          return ti;
      }
      float LGL_l(Ray r, Box b) {
          vec3 tBot = (b.min - r.o) * r.invD;
          vec3 tTop = (b.max - r.o) * r.invD;
          vec3 tNear = min(tBot, tTop);
          vec3 tFar = max(tBot, tTop);
          float t0 = max(tNear.x, max(tNear.y, tNear.z));
          float t1 = min(tFar.x, min(tFar.y, tFar.z));
          return (t0 > t1 || t0 > r.tMax) ? -1.0 : (t0 > 0.0 ? t0 : t1);
      }
      bool LGL_m(inout Ray ray, float maxDist) {
      #if defined(NUM_LIGHTS)
          for(int i = 0; i < NUM_LIGHTS; i++) {
              vec3 position = lights.position[i];
              vec3 emission = lights.emission[i];
              vec3 p1 = lights.p1[i];
              vec3 p2 = lights.p2[i];
              vec4 params = lights.params[i];
              float radius = params.x;
              float area = params.y;
              float type = params.z;
              float visible = params.w;
              if(type == 0. || type == 1.) {
                  vec3 normal = normalize(cross(p1, p2));
                  if(dot(normal, ray.d) > 0.)
                      continue;
                  vec4 plane = vec4(normal, dot(normal, position));
                  p1 *= 1.0 / dot(p1, p1);
                  p2 *= 1.0 / dot(p2, p2);
                  float d = LGL_g(position, p1, p2, plane, ray);
                  if(d > 0. && d < maxDist)
                      return true;
              }
              if(type == 1.) {
                  float d = LGL_f(radius, position, ray);
                  if(d > 0. && d < maxDist)
                      return true;
              }
          }
      #endif
          int nodesToVisit[STACK_SIZE];
          nodesToVisit[0] = 0;
          int stack = 0;
          while(stack >= 0) {
              int i = nodesToVisit[stack--];
              vec4 r1 = fetchData(bvhBuffer, i, BVH_COLUMNS);
              vec4 r2 = fetchData(bvhBuffer, i + 1, BVH_COLUMNS);
              int splitAxisOrNumPrimitives = floatBitsToInt(r1.w);
              if(splitAxisOrNumPrimitives >= 0) {
                  int splitAxis = splitAxisOrNumPrimitives;
                  Box bbox = Box(r1.xyz, r2.xyz);
                  if(LGL_l(ray, bbox) > 0.0) {
                      if(ray.d[splitAxis] > 0.0) {
                          nodesToVisit[++stack] = floatBitsToInt(r2.w);
                          nodesToVisit[++stack] = i + 2;
                      } else {
                          nodesToVisit[++stack] = i + 2;
                          nodesToVisit[++stack] = floatBitsToInt(r2.w);
                      }
                  }
              } else {
                  ivec3 index = floatBitsToInt(r1.xyz);
                  Triangle tri = Triangle(fetchData(positionBuffer, index.x, VERTEX_COLUMNS).xyz, fetchData(positionBuffer, index.y, VERTEX_COLUMNS).xyz, fetchData(positionBuffer, index.z, VERTEX_COLUMNS).xyz);
                  TriangleIntersect hit = LGL_k(ray, tri);
                  if(hit.t > 0.0 && hit.t < maxDist) {
                      return true;
                  }
              }
          }
          return false;
      }
      void LGL_n(inout Ray ray, inout SurfaceInteraction si, inout LightSampleRec lightSampleRec, int bounce) {
          si.hit = false;
          float t = INF;
          float d;
      #if defined(NUM_LIGHTS)
          for (int i = 0; i < NUM_LIGHTS; i++) {
              vec4 params = lights.params[i];
              float radius = params.x;
              float area = params.y;
              float type = params.z;
              float visible = params.w;
              if (bounce == 0 && visible < 0.1) continue;
              vec3 position = lights.position[i];
              vec3 emission = lights.emission[i];
              vec3 p1 = lights.p1[i];
              vec3 p2 = lights.p2[i];
              if (type == 0. || type == 1.) {
                  vec3 normal = normalize(cross(p1, p2));
                  if (dot(normal, ray.d) > 0.) continue;
                  vec4 plane = vec4(normal, dot(normal, position));
                  p1 *= 1.0 / dot(p1, p1);
                  p2 *= 1.0 / dot(p2, p2);
                  d = LGL_g(position, p1, p2, plane, ray);
                  if(d < 0.)
                      d = INF;
                  if(d < t) {
                      t = d;
                      float cosTheta = dot(-ray.d, normal);
                      float pdf = (t * t) / (area * cosTheta);
                      lightSampleRec.emission = emission;
                      lightSampleRec.pdf = pdf;
                      si.hit = true;
                      si.LGL_BI = true;
                      ray.tMax = t;
                  }
              }
              if(type == 2.) {
                  d = LGL_f(radius, position, ray);
                  if(d < 0.)
                      d = INF;
                  if(d < t) {
                      t = d;
                      float pdf = (t * t) / area;
                      lightSampleRec.emission = emission;
                      lightSampleRec.pdf = pdf;
                      si.hit = true;
                      si.LGL_BI = true;
                      ray.tMax = t;
                  }
              }
          }
      #endif
          int nodesToVisit[STACK_SIZE];
          nodesToVisit[0] = 0;
          int stack = 0;
          while(stack >= 0) {
              int i = nodesToVisit[stack--];
              vec4 r1 = fetchData(bvhBuffer, i, BVH_COLUMNS);
              vec4 r2 = fetchData(bvhBuffer, i + 1, BVH_COLUMNS);
              int splitAxisOrNumPrimitives = floatBitsToInt(r1.w);
              if(splitAxisOrNumPrimitives >= 0) {
                  int splitAxis = splitAxisOrNumPrimitives;
                  Box bbox = Box(r1.xyz, r2.xyz);
                  if(LGL_l(ray, bbox) > 0.0) {
                      if(ray.d[splitAxis] > 0.0) {
                          nodesToVisit[++stack] = floatBitsToInt(r2.w);
                          nodesToVisit[++stack] = i + 2;
                      } else {
                          nodesToVisit[++stack] = i + 2;
                          nodesToVisit[++stack] = floatBitsToInt(r2.w);
                      }
                  }
              } else {
                  ivec3 index = floatBitsToInt(r1.xyz);
                  Triangle tri = Triangle(fetchData(positionBuffer, index.x, VERTEX_COLUMNS).xyz, fetchData(positionBuffer, index.y, VERTEX_COLUMNS).xyz, fetchData(positionBuffer, index.z, VERTEX_COLUMNS).xyz);
                  TriangleIntersect hit = LGL_k(ray, tri);
                  if(hit.t > 0.0) {
                      int materialIndex = floatBitsToInt(r2.w);
                      vec3 faceNormal = r2.xyz;
                      si.t = hit.t;
                      si.LGL_BI = false;
                      ray.tMax = hit.t;
                      surfaceInteractionFromBVH(si, tri, hit.barycentric, index, faceNormal, materialIndex);
                      si.LGL_BL = dot(si.faceNormal, ray.d) <= 0.0 ? si.normal : -si.normal;
                  }
              }
          }
          si.roughness = clamp(si.roughness, ROUGHNESS_MIN, 1.0);
          si.metalness = clamp(si.metalness, 0.0, 1.0);
      }
      void LGL_o(inout Ray ray, inout SurfaceInteraction si, inout LightSampleRec lightSampleRec, int depth) {
          if(si.hit && !si.LGL_BI && si.LGL_BD < 1.0) {
              float LGL_BJ = LGL_AQ();
              while(si.hit && !si.LGL_BI && LGL_BJ > si.LGL_BD) {
                  initRay(ray, si.position + EPS * ray.d, ray.d);
                  LGL_n(ray, si, lightSampleRec, depth);
              }
          }
      }
      #ifndef CONST_COLOR_ENV
      uniform sampler2D envMap;
      uniform sampler2D envMapDistribution;
      vec2 LGL_Y(vec3 pointOnSphere) {
          float phi = mod(atan(-pointOnSphere.z, -pointOnSphere.x), TWOPI);
          float theta = acos(pointOnSphere.y);
          return vec2(phi * 0.5 * INVPI, theta * INVPI);
      }
      vec3 LGL_Z(vec3 d) {
          vec2 uv = LGL_Y(d);
          return LGL_An(envMap, uv).rgb;
      }
      float LGL_a(float u, out int vOffset, out float pdf) {
          ivec2 size = textureSize(envMap, 0);
          int left = 0;
          int right = size.y + 1;
          while(left < right) {
              int mid = (left + right) >> 1;
              float s = texelFetch(envMapDistribution, ivec2(0, mid), 0).x;
              if(s <= u) {
                  left = mid + 1;
              } else {
                  right = mid;
              }
          }
          vOffset = left - 1;
          vec2 s0 = texelFetch(envMapDistribution, ivec2(0, vOffset), 0).xy;
          vec2 s1 = texelFetch(envMapDistribution, ivec2(0, vOffset + 1), 0).xy;
          pdf = s0.y;
          return (float(vOffset) + (u - s0.x) / (s1.x - s0.x)) / float(size.y);
      }
      float LGL_b(float u, int vOffset, out float pdf) {
          ivec2 size = textureSize(envMap, 0);
          int left = 0;
          int right = size.x + 1;
          while(left < right) {
              int mid = (left + right) >> 1;
              float s = texelFetch(envMapDistribution, ivec2(1 + mid, vOffset), 0).x;
              if(s <= u) {
                  left = mid + 1;
              } else {
                  right = mid;
              }
          }
          int uOffset = left - 1;
          vec2 s0 = texelFetch(envMapDistribution, ivec2(1 + uOffset, vOffset), 0).xy;
          vec2 s1 = texelFetch(envMapDistribution, ivec2(1 + uOffset + 1, vOffset), 0).xy;
          pdf = s0.y;
          return (float(uOffset) + (u - s0.x) / (s1.x - s0.x)) / float(size.x);
      }
      float LGL_c(vec2 uv) {
          vec2 size = vec2(textureSize(envMap, 0));
          float sinTheta = sin(uv.y * PI);
          uv *= size;
          float partialX = texelFetch(envMapDistribution, ivec2(1.0 + uv.x, uv.y), 0).y;
          float partialY = texelFetch(envMapDistribution, ivec2(0, uv.y), 0).y;
          return partialX * partialY * INVPI2 / (2.0 * sinTheta);
      }
      vec3 LGL_d(vec2 LGL_AQom, out vec2 uv, out float pdf) {
          vec2 partialPdf;
          int vOffset;
          uv.y = LGL_a(LGL_AQom.x, vOffset, partialPdf.y);
          uv.x = LGL_b(LGL_AQom.y, vOffset, partialPdf.x);
          float phi = uv.x * TWOPI;
          float theta = uv.y * PI;
          float cosTheta = cos(theta);
          float sinTheta = sin(theta);
          float cosPhi = cos(phi);
          float sinPhi = sin(phi);
          vec3 dir = vec3(-sinTheta * cosPhi, cosTheta, -sinTheta * sinPhi);
          pdf = partialPdf.x * partialPdf.y * INVPI2 / (2.0 * sinTheta);
          return dir;
      }
      #endif
      void LGL_AZ(in vec3 N, inout vec3 T, inout vec3 B) {
          if(N.z < -0.999999) {
              T = vec3(0., -1., 0.);
              B = vec3(-1., 0., 0.);
          } else {
              float a = 1.0 / (1. + N.z);
              float b = -N.x * N.y * a;
              T = vec3(1.0 - N.x * N.x * a, b, -N.x);
              B = vec3(b, 1. - N.y * N.y * a, -N.y);
          }
      }
      vec3 LGL_Am(vec3 V, float rgh, float r1, float r2) {
          vec3 Vh = normalize(vec3(rgh * V.x, rgh * V.y, V.z));
          float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
          vec3 T1 = lensq > 0. ? vec3(-Vh.y, Vh.x, 0) * inversesqrt(lensq) : vec3(1., 0., 0.);
          vec3 T2 = cross(Vh, T1);
          float r = sqrt(r1);
          float phi = 2.0 * PI * r2;
          float t1 = r * cos(phi);
          float t2 = r * sin(phi);
          float s = 0.5 * (1.0 + Vh.z);
          t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;
          vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;
          return normalize(vec3(rgh * Nh.x, rgh * Nh.y, max(0.0, Nh.z)));
      }
      vec2 LGL_Aa(vec2 p) {
          p = 2.0 * p - 1.0;
          bool greater = abs(p.x) > abs(p.y);
          float r = greater ? p.x : p.y;
          float theta = greater ? 0.25 * PI * p.y / p.x : PI * (0.5 - 0.25 * p.x / p.y);
          return r * vec2(cos(theta), sin(theta));
      }
      vec3 LGL_Ab(vec2 p) {
          vec2 h = LGL_Aa(p);
          float z = sqrt(max(0.0, 1.0 - h.x * h.x - h.y * h.y));
          return vec3(h, z);
      }
      vec3 LGL_Ac(float r1, float r2) {
          float z = 1.0 - 2.0 * r1;
          float r = sqrt(max(0.0, 1.0 - z * z));
          float phi = TWOPI * r2;
          return vec3(r * cos(phi), r * sin(phi), z);
      }
      vec3 LGL_Ad(vec3 faceNormal, vec3 viewDir, mat3 basis, float roughness, vec2 LGL_AQom) {
          float phi = TWOPI * LGL_AQom.y;
          float alpha = roughness * roughness;
          float cosTheta = sqrt((1.0 - LGL_AQom.x) / (1.0 + (alpha * alpha - 1.0) * LGL_AQom.x));
          float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
          vec3 halfVector = basis * sign(dot(faceNormal, viewDir)) * vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
          vec3 lightDir = reflect(-viewDir, halfVector);
          return lightDir;
      }
      vec3 LGL_Ae(vec3 faceNormal, vec3 viewDir, mat3 basis, vec2 LGL_AQom) {
          return basis * sign(dot(faceNormal, viewDir)) * LGL_Ab(LGL_AQom);
      }
      float LGL_Af(float f, float g) {
          return (f * f) / (f * f + g * g);
      }
      vec3 LGL_Ag(in Ray r, int depth, in LightSampleRec lightSampleRec, in BsdfSampleRec bsdfSampleRec) {
          vec3 Le;
          if(depth == 0) {
              Le = lightSampleRec.emission;
          } else {
              Le = LGL_Af(bsdfSampleRec.pdf, lightSampleRec.pdf) * lightSampleRec.emission;
          }
          return Le;
      }
      #if defined(NUM_LIGHTS)
      void LGL_Ah(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec, vec2 LGL_AQom) {
          float r1 = LGL_AQom.x;
          float r2 = LGL_AQom.y;
          vec3 lightSurfacePos = light.position + LGL_Ac(r1, r2) * light.radius;
          lightSampleRec.direction = lightSurfacePos - surfacePos;
          lightSampleRec.dist = length(lightSampleRec.direction);
          float distSq = lightSampleRec.dist * lightSampleRec.dist;
          lightSampleRec.direction /= lightSampleRec.dist;
          lightSampleRec.normal = normalize(lightSurfacePos - light.position);
          lightSampleRec.emission = light.emission * float(NUM_LIGHTS);
          lightSampleRec.pdf = distSq / (light.area * abs(dot(lightSampleRec.normal, lightSampleRec.direction)));
      }
      void LGL_Aj(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec, vec2 LGL_AQom) {
          float r1 = LGL_AQom.x;
          float r2 = LGL_AQom.y;
          vec3 lightSurfacePos = light.position + light.p1 * r1 + light.p2 * r2;
          lightSampleRec.direction = lightSurfacePos - surfacePos;
          lightSampleRec.dist = length(lightSampleRec.direction);
          float distSq = lightSampleRec.dist * lightSampleRec.dist;
          lightSampleRec.direction /= lightSampleRec.dist;
          lightSampleRec.normal = normalize(cross(light.p1, light.p2));
          lightSampleRec.emission = light.emission * float(NUM_LIGHTS);
          lightSampleRec.pdf = distSq / (light.area * abs(dot(lightSampleRec.normal, lightSampleRec.direction)));
      }
      void LGL_Ak(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec) {
          lightSampleRec.direction = normalize(light.position - light.p1);
          lightSampleRec.normal = normalize(surfacePos - light.position);
          if(dot(lightSampleRec.direction, lightSampleRec.normal) > 0.0) {
              lightSampleRec.normal = -lightSampleRec.normal;
          }
          lightSampleRec.emission = light.emission * float(NUM_LIGHTS);
          lightSampleRec.dist = INF;
          lightSampleRec.pdf = 1.0;
      }
      void samplePointLight(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec) {
          lightSampleRec.direction = light.position - surfacePos;
          lightSampleRec.dist = length(lightSampleRec.direction);
          float distSq = lightSampleRec.dist * lightSampleRec.dist;
          lightSampleRec.direction = normalize(lightSampleRec.direction);
          lightSampleRec.normal = normalize(surfacePos - light.position);
          lightSampleRec.emission = light.emission * float(NUM_LIGHTS) / distSq;
          lightSampleRec.pdf = 1.0;
      }
      void LGL_Al(in Light light, in vec3 surfacePos, inout LightSampleRec lightSampleRec, vec2 LGL_AQom) {
          int type = int(light.type);
          if(type == 0 || type == 1) {
              LGL_Aj(light, surfacePos, lightSampleRec, LGL_AQom);
          } else if(type == 2) {
              LGL_Ah(light, surfacePos, lightSampleRec, LGL_AQom);
          } else if(type == 3) {
              LGL_Ak(light, surfacePos, lightSampleRec);
          } else if(type == 4) {
              samplePointLight(light, surfacePos, lightSampleRec);
          }
      }
      #endif
      vec3 LocalToWorld(vec3 X, vec3 Y, vec3 Z, vec3 V) {
          return vec3(X.x * V.x + Y.x * V.y + Z.x * V.z, X.y * V.x + Y.y * V.y + Z.y * V.z, X.z * V.x + Y.z * V.y + Z.z * V.z);
      }
      vec3 WorldToLocal(vec3 X, vec3 Y, vec3 Z, vec3 V) {
          return vec3(dot(V, X), dot(V, Y), dot(V, Z));
      }
      vec3 LGL_A(float r1, float r2) {
          vec3 dir;
          float r = sqrt(r1);
          float phi = TWOPI * r2;
          dir.x = r * cos(phi);
          dir.y = r * sin(phi);
          dir.z = sqrt(max(0.0, 1.0 - dir.x * dir.x - dir.y * dir.y));
          return dir;
      }
      float LGL_B(float eta) {
          float sqrtR0 = (eta - 1.) / (eta + 1.);
          return sqrtR0 * sqrtR0;
      }
      vec3 LGL_C(vec3 baseColor) {
          float luminance = LGL_AV(baseColor);
          return (luminance > 0.0) ? baseColor / luminance : vec3(1.);
      }
      void LGL_D(SurfaceInteraction si, out vec3 Cspec0, out vec3 Csheen) {
          vec3 tint = LGL_C(si.color);
          if(si.LGL_BG > 0.1) {
              Cspec0 = si.specularColor;
          } else {
              Cspec0 = mix(LGL_B(si.ior) * mix(vec3(1.0), tint, min(si.LGL_Ay, 0.99)), si.color, si.metalness);
          }
          Csheen = mix(vec3(1.0), tint, si.LGL_Az);
      }
      float LGL_E(float u) {
          float m = clamp(1.0 - u, 0.0, 1.0);
          float m2 = m * m;
          return m2 * m2 * m;
      }
      float LGL_F(float F0, float cosTheta) {
          return mix(F0, 1.0, LGL_E(cosTheta));
      }
      vec3 LGL_F(vec3 F0, float cosTheta) {
          return mix(F0, vec3(1.), LGL_E(cosTheta));
      }
      float LGL_G(float cosThetaI, float eta) {
          float sinThetaTSq = eta * eta * (1.0f - cosThetaI * cosThetaI);
          if(sinThetaTSq > 1.0)
              return 1.0;
          float cosThetaT = sqrt(max(1.0 - sinThetaTSq, 0.0));
          float rs = (eta * cosThetaT - cosThetaI) / (eta * cosThetaT + cosThetaI);
          float rp = (eta * cosThetaI - cosThetaT) / (eta * cosThetaI + cosThetaT);
          return 0.5 * (rs * rs + rp * rp);
      }
      vec3 LGL_H(vec3 F0, float metalness, float eta, float cosThetaI) {
          vec3 FrSchlick = LGL_F(F0, cosThetaI);
          float FrDielectric = LGL_G(cosThetaI, eta);
          return mix(vec3(FrDielectric), FrSchlick, metalness);
      }
      float LGL_H(float metalness, float eta, float cosThetaI) {
          float FrSchlick = LGL_E(cosThetaI);
          float FrDielectric = LGL_G(cosThetaI, eta);
          return mix(FrDielectric, FrSchlick, metalness);
      }
      float LGL_I(float NDotV, float alphaG) {
          float a = alphaG * alphaG;
          float b = NDotV * NDotV;
          return 1.0 / (NDotV + sqrt(a + b - a * b));
      }
      float LGL_J(float NDotH, float alpha) {
          float alpha2 = alpha * alpha;
          float t = 1.0 + (alpha2 - 1.0) * NDotH * NDotH;
          return (alpha2 - 1.0) / (PI * log(alpha2) * t);
      }
      float LGL_K(float NDotH, float a) {
          float a2 = a * a;
          float t = 1.0 + (a2 - 1.0) * NDotH * NDotH;
          return a2 / (PI * t * t);
      }
      vec3 ImportanceSampleLGL_J(float rgh, float r1, float r2) {
          float a = max(0.001, rgh);
          float a2 = a * a;
          float phi = r1 * TWOPI;
          float cosTheta = sqrt((1.0 - pow(a2, 1.0 - r1)) / (1.0 - a2));
          float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
          float sinPhi = sin(phi);
          float cosPhi = cos(phi);
          return vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
      }
      vec3 ImportanceSampleLGL_K(float rgh, float r1, float r2) {
          float a = max(0.001, rgh);
          float phi = r1 * TWOPI;
          float cosTheta = sqrt((1.0 - r2) / (1.0 + (a * a - 1.0) * r2));
          float sinTheta = clamp(sqrt(1.0 - (cosTheta * cosTheta)), 0.0, 1.0);
          float sinPhi = sin(phi);
          float cosPhi = cos(phi);
          return vec3(sinTheta * cosPhi, sinTheta * sinPhi, cosTheta);
      }
      vec3 LGL_N(SurfaceInteraction si, vec3 Csheen, vec3 V, vec3 L, vec3 H, out float pdf) {
          pdf = 0.0;
          if(L.z <= 0.0)
              return vec3(0.0);
          pdf = L.z * INVPI;
          float LDotH = dot(L, H);
          float FL = LGL_E(L.z);
          float FV = LGL_E(V.z);
          float Fh = LGL_E(LDotH);
          float Fd90 = 0.5 + 2.0 * LDotH * LDotH * si.roughness;
          float Fd = mix(1.0, Fd90, FL) * mix(1.0, Fd90, FV);
          float Fss90 = LDotH * LDotH * si.roughness;
          float Fss = mix(1.0, Fss90, FL) * mix(1.0, Fss90, FV);
          float DisneyFakeSS = 1.25 * (Fss * (1.0 / (L.z + V.z) - 0.5) + 0.5);
          vec3 Fsheen = Fh * si.sheen * Csheen;
          return (INVPI * mix(Fd, DisneyFakeSS, si.LGL_BB) * si.color + Fsheen) * (1.0 - si.metalness) * (1.0 - si.LGL_BC);
      }
      vec3 LGL_O(SurfaceInteraction si, vec3 Cspec0, vec3 V, vec3 L, vec3 H, out float pdf) {
          pdf = 0.0;
          if(L.z <= 0.0)
              return vec3(0.0);
          float LDotH = dot(L, H);
          float D = LGL_K(H.z, si.roughness);
          pdf = D * H.z / (4.0 * LDotH);
          vec3 F = LGL_H(Cspec0, si.metalness, si.eta, LDotH);
          float G = LGL_I(abs(L.z), si.roughness) * LGL_I(abs(V.z), si.roughness);
          return F * D * G;
      }
      vec3 LGL_P(SurfaceInteraction si, vec3 Cspec0, vec3 V, vec3 L, vec3 H, out float pdf) {
          pdf = 0.0;
          if(L.z >= 0.0)
              return vec3(0.0);
          float F = LGL_G(abs(dot(V, H)), si.eta);
          float D = LGL_K(H.z, si.roughness);
          float denomSqrt = dot(L, H) + dot(V, H) * si.eta;
          pdf = D * H.z * abs(dot(L, H)) / (denomSqrt * denomSqrt);
          float G = LGL_I(abs(L.z), si.roughness) * LGL_I(abs(V.z), si.roughness);
          vec3 specColor = pow(si.color, vec3(0.5));
          return specColor * (1.0 - si.metalness) * si.LGL_BC * (1.0 - F) * D * G * abs(dot(V, H)) * abs(dot(L, H)) * 4.0 * si.eta * si.eta / (denomSqrt * denomSqrt);
      }
      vec3 LGL_Q(SurfaceInteraction si, vec3 V, vec3 L, vec3 H, out float pdf) {
          pdf = 0.0;
          if(L.z <= 0.0)
              return vec3(0.0);
          float LDotH = dot(L, H);
          float F = LGL_F(.04, LDotH);
          float D = LGL_J(H.z, mix(0.1, 0.001, 1. - si.LGL_BA));
          pdf = D * H.z / (4.0 * LDotH);
          float G = LGL_I(L.z, 0.25) * LGL_I(V.z, 0.25);
          return vec3(0.25 * si.clearcoat * F * D * G);
      }
      void LGL_R(SurfaceInteraction si, vec3 Cspec0, float fresnelWeight, out float LGL_S, out float LGL_T, out float LGL_U, out float LGL_V) {
          LGL_S = max(LGL_AV(si.color), si.sheen) * (1.0 - si.metalness) * (1.0 - si.LGL_BC);
          LGL_T = LGL_AV(mix(Cspec0, vec3(1.0), fresnelWeight));
          LGL_U = (1.0 - fresnelWeight) * (1.0 - si.metalness) * si.LGL_BC * LGL_AV(si.color);
          LGL_V = si.clearcoat * (1.0 - si.metalness);
          float weightSum = LGL_S + LGL_T + LGL_U + LGL_V;
          LGL_S /= weightSum;
          LGL_T /= weightSum;
          LGL_U /= weightSum;
          LGL_V /= weightSum;
      }
      vec3 LGL_W(SurfaceInteraction si, vec3 V, vec3 N, out vec3 L, out float pdf, MaterialSamples LGL_AQomSamples) {
          pdf = 0.0;
          vec3 f = vec3(0.0);
          vec2 bounceDirSample = LGL_AQomSamples.s3;
          vec2 diffuseOrSpecular = LGL_AQomSamples.s4;
          float r1 = bounceDirSample.x;
          float r2 = bounceDirSample.y;
          vec3 Cspec0, Csheen;
          LGL_D(si, Cspec0, Csheen);
          vec3 T, B;
          LGL_AZ(N, T, B);
          V = WorldToLocal(T, B, N, V);
          float LGL_S, LGL_T, LGL_U, LGL_V;
          float fresnelWeight = LGL_H(si.metalness, si.eta, V.z);
          LGL_R(si, Cspec0, fresnelWeight, LGL_S, LGL_T, LGL_U, LGL_V);
          float cdf[4];
          cdf[0] = LGL_S;
          cdf[1] = cdf[0] + LGL_T;
          cdf[2] = cdf[1] + LGL_U;
          cdf[3] = cdf[2] + LGL_V;
          if(r1 < cdf[0]) {
              r1 /= cdf[0];
              L = LGL_A(r1, r2);
              vec3 H = normalize(L + V);
              f = LGL_N(si, Csheen, V, L, H, pdf);
              pdf *= LGL_S;
          } else if(r1 < cdf[1]) {
              r1 = (r1 - cdf[0]) / (cdf[1] - cdf[0]);
              vec3 H = ImportanceSampleLGL_K(si.roughness, r1, r2);
              if(dot(V, H) < 0.0)
                  H = -H;
              L = normalize(reflect(-V, H));
              f = LGL_O(si, Cspec0, V, L, H, pdf);
              pdf *= LGL_T;
          } else if(r1 < cdf[2]) {
              r1 = (r1 - cdf[1]) / (cdf[2] - cdf[1]);
              vec3 H = ImportanceSampleLGL_K(si.roughness, r1, r2);
              if(dot(V, H) < 0.0)
                  H = -H;
              vec3 R = reflect(-V, H);
              L = normalize(refract(-V, H, si.eta));
              f = LGL_P(si, Cspec0, V, L, H, pdf);
              pdf *= LGL_U;
          } else {
              r1 = (r1 - cdf[2]) / (1.0 - cdf[2]);
              vec3 H = ImportanceSampleLGL_J(mix(0.1, 0.001, 1. - si.LGL_BA), r1, r2);
              if(dot(V, H) < 0.0)
                  H = -H;
              L = normalize(reflect(-V, H));
              f = LGL_Q(si, V, L, H, pdf);
              pdf *= LGL_V;
          }
          L = LocalToWorld(T, B, N, L);
          return f * abs(dot(N, L));
      }
      vec3 LGL_X(inout SurfaceInteraction si, vec3 V, vec3 L, out float bsdfPdf) {
          bsdfPdf = 0.0;
          vec3 f = vec3(0.0);
          vec3 N = si.LGL_BL;
          vec3 T, B;
          LGL_AZ(N, T, B);
          V = WorldToLocal(T, B, N, V);
          L = WorldToLocal(T, B, N, L);
          vec3 H;
          if(L.z > 0.0) {
              H = normalize(L + V);
          } else {
              H = normalize(L + V * si.eta);
          }
          if(dot(V, H) < 0.0) {
              H = -H;
          }
          vec3 Cspec0, Csheen;
          LGL_D(si, Cspec0, Csheen);
          float LGL_S, LGL_T, LGL_U, LGL_V;
          float fresnelWeight = LGL_H(si.metalness, si.eta, abs(dot(L, H)));
          LGL_R(si, Cspec0, fresnelWeight, LGL_S, LGL_T, LGL_U, LGL_V);
          float pdf;
          if(LGL_S > 0.0 && L.z > 0.0) {
              f += LGL_N(si, Csheen, V, L, H, pdf);
              bsdfPdf += pdf * LGL_S;
          }
          if(LGL_T > 0.0 && L.z > 0.0 && V.z > 0.0) {
              f += LGL_O(si, Cspec0, V, L, H, pdf);
              bsdfPdf += pdf * LGL_T;
          }
          if(LGL_U > 0.0 && L.z < 0.0) {
              f += LGL_P(si, Cspec0, V, L, H, pdf);
              bsdfPdf += pdf * LGL_U;
          }
          if(LGL_V > 0.0 && L.z > 0.0 && V.z > 0.0) {
              f += LGL_Q(si, V, L, H, pdf);
              bsdfPdf += pdf * LGL_V;
          }
          return f * abs(L.z);
      }
      vec3 LGL_e(inout SurfaceInteraction si, in Path path, in vec2 s1, in vec2 s2) {
          si.eta = dot(si.normal, si.LGL_BL) > 0.0 ? (1.0 / si.ior) : si.ior;
          vec3 viewDir = -path.ray.d;
          vec3 surfacePos = si.position + EPS * si.normal;
          vec3 Li = vec3(0.0);
          BsdfSampleRec bsdfSampleRec;
          vec2 lightDirSample = s1;
          vec2 envDirSample = s2;
          vec3 lightDir;
          vec2 uv;
          float lightPdf;
          bool brdfSample = false;
      #ifndef CONST_COLOR_ENV
          lightDir = LGL_d(envDirSample, uv, lightPdf);
          initRay(path.ray, surfacePos, lightDir);
          if(!LGL_m(path.ray, INF - EPS)) {
              vec3 irr = LGL_An(envMap, uv).rgb * envMapIntensity;
              bsdfSampleRec.f = LGL_X(si, viewDir, lightDir, bsdfSampleRec.pdf);
              if(bsdfSampleRec.pdf > 0.0) {
                  float LGL_BR = LGL_Af(lightPdf, bsdfSampleRec.pdf);
                  if(LGL_BR > 0.0) {
                      Li += LGL_BR * bsdfSampleRec.f * irr / lightPdf;
                  }
              }
          }
      #endif
      #if defined(NUM_LIGHTS)
          LightSampleRec lightSampleRec;
          Light light;
          int i = int(lightDirSample.x * float(NUM_LIGHTS));
          vec3 position = lights.position[i];
          vec3 emission = lights.emission[i];
          vec3 p1 = lights.p1[i];
          vec3 p2 = lights.p2[i];
          vec4 params = lights.params[i];
          float radius = params.x;
          float area = params.y;
          float type = params.z;
          float visible = params.w;
          light = Light(position, emission, p1, p2, radius, area, type, visible);
          LGL_Al(light, surfacePos, lightSampleRec, lightDirSample);
          if(dot(lightSampleRec.direction, lightSampleRec.normal) < 0.0) {
              initRay(path.ray, surfacePos, lightSampleRec.direction);
              if(!LGL_m(path.ray, lightSampleRec.dist - EPS)) {
                  bsdfSampleRec.f = LGL_X(si, viewDir, lightSampleRec.direction, bsdfSampleRec.pdf);
                  float LGL_BR = 1.0;
                  if(light.area > 0.0 && bsdfSampleRec.pdf > 0.0) {
                      LGL_BR = LGL_Af(lightSampleRec.pdf, bsdfSampleRec.pdf);
                  }
                  if(LGL_BR > 0.0) {
                      Li += LGL_BR * bsdfSampleRec.f * lightSampleRec.emission / lightSampleRec.pdf;
                  }
              }
          }
      #endif
          return Li;
      }
     // layout(location = 0) out vec4 out_light;
      void bounce(inout Path path, int depth, inout SurfaceInteraction si, inout BsdfSampleRec bsdfSampleRec, in LightSampleRec lightSampleRec) {
          if(!si.hit) {
              if(depth == 0 && enviromentVisible == 0.) {
                  path.alpha = 0.0;
                  path.LGL_BQ = true;
                  return;
              }
      #ifdef CONST_COLOR_ENV
              path.li += backgroundColor * path.beta;
              path.LGL_BQ = true;
              return;
      #else
              float LGL_BR = 1.0;
              if(depth > 0) {
                  float lightPdf = LGL_c(LGL_Y(path.ray.d));
                  LGL_BR = LGL_Af(bsdfSampleRec.pdf, lightPdf);
              }
              vec3 irr = LGL_Z(path.ray.d) * envMapIntensity;
              path.li += LGL_BR * path.beta * irr;
              path.LGL_BQ = true;
              return;
      #endif
          }
          if(si.LGL_BI) {
              path.li += LGL_Ag(path.ray, depth, lightSampleRec, bsdfSampleRec) * path.beta;
              path.LGL_BQ = true;
              return;
          }
          if(dot(si.normal, si.LGL_BL) > 0.0) {
              path.LGL_BS = vec3(0.0);
          }
          path.li += path.beta * si.emissive;
          path.beta *= exp(-path.LGL_BS * si.t);
          MaterialSamples LGL_AQomSamples = getRandomMaterialSamples();
          if(si.LGL_BH == RAYTRACEMTL) {
              path.li += LGL_e(si, path, LGL_AQomSamples.s1, LGL_AQomSamples.s2) * path.beta;
          }
          bsdfSampleRec.f = LGL_W(si, -path.ray.d, si.LGL_BL, bsdfSampleRec.L, bsdfSampleRec.pdf, LGL_AQomSamples);
          if(dot(si.LGL_BL, bsdfSampleRec.L) < 0.0) {
              path.LGL_BS = -log(si.extinction) / si.LGL_BE;
          }
          if(bsdfSampleRec.pdf > 0.0) {
              path.beta *= bsdfSampleRec.f / bsdfSampleRec.pdf;
          } else {
              path.LGL_BQ = true;
              return;
          }
          if(depth >= 2) {
              float q = 1.0 - LGL_AV(path.beta);
              if(LGL_AQomSample() < q) {
                  path.LGL_BQ = true;
                  return;
              }
              path.beta /= 1.0 - q;
          }
          initRay(path.ray, si.position + EPS * bsdfSampleRec.L, bsdfSampleRec.L);
      }

      vec4 LGL_Ao(inout Ray ray) {
          SurfaceInteraction si;
          Path path;
          BsdfSampleRec bsdfSampleRec;
          LightSampleRec lightSampleRec;
          path.ray = ray;
          path.li = vec3(0);
          path.alpha = 1.0;
          path.LGL_BQ = false;
          path.LGL_BR = 1.0;
          path.LGL_BS = vec3(0.0);
          path.beta = vec3(1.0);

          for (int i = 0; i < bounces; i++) {
              if (path.LGL_BQ) {
                  return vec4(path.li, path.alpha);
              }

              LGL_n(path.ray, si, lightSampleRec, i);
              LGL_o(path.ray, si, lightSampleRec, i);
              bounce(path, i, si, bsdfSampleRec, lightSampleRec);
          }

          return vec4(path.li, path.alpha);
      }

      void main() {
          LGL_AS(frameCount);
          vec2 vCoordAntiAlias = vCoord + jitter;
          vec3 direction = normalize(vec3(vCoordAntiAlias - 0.5, -1.0) * vec3(camera.aspect, 1.0, camera.fov));
      #ifdef USE_LENS_CAMERA
          vec2 lensPoint = camera.aperture * LGL_Aa(vec2(LGL_AN(vCoordAntiAlias)));
          vec3 focusPoint = -direction * camera.focus / direction.z;
          vec3 origin = vec3(lensPoint, 0.0);
          direction = normalize(focusPoint - origin);
          origin = vec3(camera.transform * vec4(origin, 1.0));
          direction = mat3(camera.transform) * direction;
      #else
          vec3 origin = camera.transform[3].xyz;
          direction = mat3(camera.transform) * direction;
      #endif
          Ray cam;
          initRay(cam, origin, direction);
          vec4 liAndAlpha = LGL_Ao(cam);

          if (!(liAndAlpha.x < INF && liAndAlpha.x > -EPS)) {
              liAndAlpha = vec4(0, 0, 0, 1);
          }

          out_light = liAndAlpha;
      }`,
};
