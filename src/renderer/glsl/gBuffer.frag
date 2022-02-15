export default {
  source: `
        #define PI 3.14159265359
        #define TWOPI 6.28318530718
        #define INVPI 0.31830988618
        #define INVPI2 0.10132118364
        #define EPS 0.0001
        #define ONE_MINUS_EPS 0.999999
        #define INF 1000000.0
        #define ROUGHNESS_MIN 0.001
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
        layout(location = 0) out vec4 out_position;
        layout(location = 1) out vec4 out_normal;
        layout(location = 2) out vec4 out_color;
        in vec3 vPosition;
        in vec3 vNormal;
        in vec2 vUv;
        flat in ivec2 vMaterialMeshIndex;
        vec3 LGL_BMs(vec3 pos) {
            vec3 fdx = dFdx(pos);
            vec3 fdy = dFdy(pos);
            return cross(fdx, fdy);
        }
        void main() {
            int materialIndex = vMaterialMeshIndex.x;
            int meshIndex = vMaterialMeshIndex.y;
            vec2 uv = fract(vUv);
            vec3 color = LGL_z(materialIndex, uv);
            float LGL_BH = LGL_p(materialIndex);
            vec3 normal = normalize(vNormal);
            vec3 LGL_BM = normalize(LGL_BMs(vPosition));
            normal *= sign(dot(normal, LGL_BM));
        #ifdef NUM_NORMAL_MAPS
            vec3 dp1 = dFdx(vPosition);
            vec3 dp2 = dFdy(vPosition);
            vec2 duv1 = dFdx(vUv);
            vec2 duv2 = dFdy(vUv);
            vec3 tangent, bitangent;
            normal = LGL_AA(materialIndex, uv, normal, dp1, dp2, duv1, duv2, tangent, bitangent);
        #endif
            out_position = vec4(vPosition, float(meshIndex) + EPS);
            out_normal = vec4(normal, LGL_BH);
            out_color = vec4(color, 0.);
        }
    `
};
