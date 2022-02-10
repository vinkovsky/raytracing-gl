vec4 LGL_An(sampler2D map,vec2 uv){ 
    #ifdef OES_texture_float_linear
     return texture(map,uv);
    #else vec2 size=vec2(textureSize(map,0));
      vec2 texelSize=1.0/size;uv=uv*size-0.5;
      vec2 f=fract(uv);
      uv=floor(uv)+0.5;
      vec4 s1=texture(map,(uv+vec2(0,0))*texelSize);
      vec4 s2=texture(map,(uv+vec2(1,0))*texelSize);
      vec4 s3=texture(map,(uv+vec2(0,1))*texelSize);
      vec4 s4=texture(map,(uv+vec2(1,1))*texelSize);
      return mix(mix(s1,s2,f.x),mix(s3,s4,f.x),f.y); 
      #endif 
    }
      layout(location=0)out vec4 out_color;
      in vec2 vCoord;uniform sampler2D lightTex;
      uniform sampler2D LGL_AsDataTex;
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
      float LGL_Ap(float v){
          return acos(min(max(v,0.0),1.0));
      }
      float LGL_Aq(vec2 uv){
          return max(texture(LGL_AsDataTex,uv).a,0.);
          }
          vec4 LGL_Ar(){
              vec4 upscaledLight=texture(lightTex,vCoord);
              float sampleFrame=upscaledLight.a;
              float sf2=sampleFrame*sampleFrame;
              vec3 color=upscaledLight.rgb/upscaledLight.a;
              vec3 normal=texture(gNormal,vCoord).rgb;
              vec4 positionAndMeshIndex=texture(gPosition,vCoord);
              vec3 position=positionAndMeshIndex.rgb;
              float meshIndex=positionAndMeshIndex.w;
              bool isBG=meshIndex>0.0 ? false : true;
              if(isBG){
                  return upscaledLight;
              }
              vec2 size=vec2(textureSize(lightTex,0));
              int kernelRadius=9;
              float dx=1./size.x;
              float dy=1./size.y;
              float kernel[9]=float[9](1.0/16.0,1.0/8.0,1.0/16.0,1.0/8.0,1.0/4.0,1.0/8.0,1.0/16.0,1.0/8.0,1.0/16.0);
              vec2 offset[9]=vec2[9](vec2(-dx,-dy),vec2(0,-dy),vec2(dx,-dy),vec2(-dx,0),vec2(0,0),vec2(dx,0),vec2(-dx,dy),vec2(0,dy),vec2(dx,dy));
              vec3 colorSum=vec3(0.);
              float weightSum=0.;
              float var;float varSum;
              float varSumWeight;
              if(useMomentVariance>0.){
                  for(int i=0;i<kernelRadius;i++){
                      vec2 uv=vCoord+offset[i];
                      if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){
                          continue;
                          }
                    vec4 positionAndMeshIndex=texture(gPosition,uv);
                    float meshIndex=positionAndMeshIndex.w;
                    bool isBG=meshIndex>0.0 ? false : true;
                    if(isBG){
                        continue;
                        }varSum+=kernel[i]*LGL_Aq(uv);varSumWeight+=kernel[i];
            }
            if(varSumWeight>0.0){
                var=max(varSum/varSumWeight,0.0);
                }else{
                    var=max(LGL_Aq(vCoord),0.0);
                    }
        }
        for(int i=0;i<kernelRadius;i++){
            vec2 uv=vCoord+offset[i]*float(stepwidth);
            if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){
                continue;
                }vec4 positionAndMeshIndex=texture(gPosition,uv);
                float meshIndex=positionAndMeshIndex.w;
                bool isBG=meshIndex>0.0 ? false : true;
                if(isBG){continue;}vec4 upscaledLight=texture(lightTex,uv);
                vec3 kernelColor=upscaledLight.rgb/upscaledLight.a;
                float Dc=distance(color,kernelColor);
                float Wc;if(useMomentVariance>0.){Wc=min(exp(-Dc/((1.+sqrt(var))*colorFactor+1e-6)),1.0);}
                else{Wc=min(exp(-Dc/(colorFactor+1e-6)),1.0);}
                vec3 kernelNormal=texture(gNormal,uv).rgb;
                float Dn=dot(normal,kernelNormal);
                Dn=Dn/float(stepwidth*stepwidth+1e-6);
                if(Dn<1e-3){continue;}float Wn=Dn;
                vec3 kernelPosition=positionAndMeshIndex.rgb;
                float Dp=distance(position,kernelPosition);
                float Wp=min(exp(-Dp/(positionFactor+1e-6)),1.0);
                float weight=Wc*Wn*Wp*kernel[i];
                weightSum+=weight;
                colorSum+=kernelColor*weight;
                }colorSum=colorSum/weightSum;
                return vec4(colorSum*sampleFrame,sampleFrame);
                }void main(){vec4 light=LGL_Ar();out_color=light;}
