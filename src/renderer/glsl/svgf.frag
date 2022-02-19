import textureLinear from './chunks/textureLinear.glsl';

export default {
  includes: [textureLinear],
  outputs: ['color'],
  source: `
        in vec2 vCoord;

        uniform sampler2D lightTex;
        uniform sampler2D dataTex;
        uniform sampler2D gPosition;
        uniform sampler2D gNormal;
        uniform sampler2D gColor;

        uniform float colorFactor;
        uniform float normalFactor;
        uniform float positionFactor;
        uniform float stepwidth;

        uniform int level;

        uniform float useMomentVariance;
        uniform float demodulateAlbedo;

        float calcTheta(float v) {
            return acos(min(max(v, 0.0), 1.0));
        }

        float getAlpha(vec2 uv) {
            return max(texture(dataTex, uv).a, 0.);
        }

        vec4 getUpscaledLight() {
            vec4 upscaledLight = texture(lightTex, vCoord);

            float sampleFrame = upscaledLight.a;
            float sf2 = sampleFrame * sampleFrame;

            vec3 color = upscaledLight.rgb / upscaledLight.a;
            vec3 normal = texture(gNormal, vCoord).rgb;
            vec4 positionAndMeshIndex = texture(gPosition, vCoord);
            vec3 position = positionAndMeshIndex.rgb;

            float meshIndex = positionAndMeshIndex.w;

            bool isBG = meshIndex > 0.0 ? false : true;

            if (isBG) {
                return upscaledLight;
            }

            vec2 size = vec2(textureSize(lightTex, 0));
            int kernelRadius = 9;

            float dx = 1. / size.x;
            float dy = 1. / size.y;
            float kernel[9] = float[9] (1.0 / 16.0, 1.0 / 8.0, 1.0 / 16.0, 1.0 / 8.0, 1.0 / 4.0, 1.0 / 8.0, 1.0 / 16.0, 1.0 / 8.0, 1.0 / 16.0);
            
            vec2 offset[9] = vec2[9] (vec2(-dx, -dy), vec2(0, -dy), vec2(dx, -dy), vec2(-dx, 0), vec2(0, 0), vec2(dx, 0), vec2(-dx, dy), vec2(0, dy), vec2(dx, dy));
            vec3 colorSum = vec3(0.);
            
            float weightSum = 0.;
            float var;
            float varSum;
            float varSumWeight;
            
            if (useMomentVariance > 0.) {
                for (int i = 0; i < kernelRadius; i++) {
                    vec2 uv = vCoord + offset[i];

                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        continue;
                    }

                    vec4 positionAndMeshIndex = texture(gPosition, uv);
                    float meshIndex = positionAndMeshIndex.w;
                    bool isBG = meshIndex > 0.0 ? false : true;
                    
                    if (isBG) {
                        continue;
                    }
                   
                    varSum += kernel[i] * getAlpha(uv);
                    varSumWeight += kernel[i];
                }

                if (varSumWeight > 0.0) {
                    var = max(varSum / varSumWeight, 0.0);
                } else {
                    var = max(getAlpha(vCoord), 0.0);
                }
            }

            for (int i = 0; i < kernelRadius; i++) {
                vec2 uv = vCoord + offset[i] * float(stepwidth);
                
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                    continue;
                }

                vec4 positionAndMeshIndex = texture(gPosition, uv);
                float meshIndex = positionAndMeshIndex.w;
                bool isBG = meshIndex > 0.0 ? false : true;
               
                if (isBG) {
                    continue;
                }

                vec4 upscaledLight = texture(lightTex, uv);
                
                // alpha channel stores the number of samples progressively rendered
                // divide the sum of light by alpha to obtain average contribution of light

                // in addition, alpha contains a scale factor for the shadow catcher material
                // dividing by alpha normalizes the brightness of the shadow catcher to match the background env map.   
                vec3 kernelColor = upscaledLight.rgb / upscaledLight.a;
                float distanceColor = distance(color, kernelColor);
                float weightColor;

                if (useMomentVariance > 0.) {
                    weightColor = min(exp(-distanceColor / ((1. + sqrt(var)) * colorFactor + 1e-6)), 1.0);
                } else {
                    weightColor = min(exp(-distanceColor / (colorFactor + 1e-6)), 1.0);
                }

                vec3 kernelNormal = texture(gNormal, uv).rgb;
                float dotNormal = dot(normal, kernelNormal);
                dotNormal = dotNormal / float(stepwidth * stepwidth + 1e-6);
                
                if (dotNormal < 1e-3) {
                    continue;
                }
                
                float weightNormal = dotNormal;
                vec3 kernelPosition = positionAndMeshIndex.rgb;
                
                float distancePosition = distance(position, kernelPosition);
                float weightPosition = min(exp(-distancePosition / (positionFactor + 1e-6)), 1.0);
                float weight = weightColor * weightNormal * weightPosition * kernel[i];
                
                weightSum += weight;
                colorSum += kernelColor * weight;
            }

            colorSum = colorSum / weightSum;

            return vec4(colorSum * sampleFrame, sampleFrame);
        }

        void main() {
            vec4 light = getUpscaledLight();
            out_color = light;
        }
    `
};
