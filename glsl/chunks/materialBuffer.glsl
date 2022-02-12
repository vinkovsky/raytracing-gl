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

float getMatType(int materialIndex) {
	return materials.colorAndMaterialType[materialIndex].w;
}

float getMatWorkflow(int materialIndex) {
	return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].w;
}

vec3 getMatEmissive(int materialIndex, vec2 uv) {
	// Todo: emissive Intensity
	vec3 emissive = vec3(0.0);

	#ifdef NUM_EMISSIVE_MAPS
	int emissiveMapIndex = materials.emissiveSpecularGlossinessMapIndex[materialIndex].x;
	if(emissiveMapIndex >= 0) {
		emissive = texture(emissiveMap, vec3(uv * materials.pbrMapSize[emissiveMapIndex].xy, emissiveMapIndex)).rgb;
	}
	#endif

	return emissive;
}

vec3 getMatSpecularColor(int materialIndex, vec2 uv) {
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

float getMatGlossiness(int materialIndex, vec2 uv) {
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

float getMatRoughness(int materialIndex, vec2 uv) {
	float workflow = getMatWorkflow(materialIndex);
	float roughness = 0.0;
	if(workflow > 0.1) {
		roughness = 1.0 - getMatGlossiness(materialIndex, uv);
	} else {
		roughness = materials.roughnessMetalnessNormalScale[materialIndex].x;

		#ifdef NUM_PBR_MAPS
		int roughnessMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].z;
		if(roughnessMapIndex >= 0) {
			roughness *= texture(pbrMap, vec3(uv * materials.pbrMapSize[roughnessMapIndex].xy, roughnessMapIndex)).g;
		}
		#endif
	}
	// Remap
	return roughness * roughness;
}

float max3(const vec3 v) {
	return max(v.x, max(v.y, v.z));
}

float computeMetallicFromSpecularColor(const vec3 specularColor) {
	return max3(specularColor);
}

vec3 computeDiffuseColor(const vec3 baseColor, float metallic) {
	return baseColor * (1.0 - metallic);
}

float getMatMetalness(int materialIndex, vec2 uv) {
	float workflow = getMatWorkflow(materialIndex);
	float metalness = 0.0;
	if(workflow > 0.1) {
		vec3 specularFactor = getMatSpecularColor(materialIndex, uv);
		metalness = computeMetallicFromSpecularColor(specularFactor);
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

vec3 getMatColor(int materialIndex, vec2 uv) {
	// if (enableAlbedo && bounce == 0) return vec3(1.);
	vec3 color = materials.colorAndMaterialType[materialIndex].rgb;
	#ifdef NUM_DIFFUSE_MAPS
	int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
	if(diffuseMapIndex >= 0) {
		color *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).rgb;
	}
	#endif

	float workflow = getMatWorkflow(materialIndex);
	if(workflow > 0.1) {
		vec3 specularFactor = getMatSpecularColor(materialIndex, uv);
		color = computeDiffuseColor(color, computeMetallicFromSpecularColor(specularFactor));
	}

	return color;
}

vec3 getMatNormal(int materialIndex, vec2 uv, vec3 normal, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2, inout vec3 tangent, inout vec3 bitangent) {
	// http://www.thetenthplanet.de/archives/1180
	// Compute co-tangent and co-bitangent vectors
	vec3 dp2perp = cross(dp2, normal);
	vec3 dp1perp = cross(normal, dp1);
	vec3 dpdu = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 dpdv = dp2perp * duv1.y + dp1perp * duv2.y;
	float invmax = inversesqrt(max(dot(dpdu, dpdu), dot(dpdv, dpdv)));
	dpdu *= invmax;
	dpdv *= invmax;

	// All world space
	// Todo: /3ed-2018/Materials/BSDFs => WorldToLocal/LocalToWorld
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

// alphaSpecularTintSheenSheenTint
float getMatAlpha(int materialIndex, vec2 uv) {
	float alpha = materials.alphaSpecularTintSheenSheenTint[materialIndex].x;
	#ifdef NUM_DIFFUSE_MAPS
	int diffuseMapIndex = materials.diffuseNormalRoughnessMetalnessMapIndex[materialIndex].x;
	if(diffuseMapIndex >= 0) {
		alpha *= texture(diffuseMap, vec3(uv * materials.diffuseNormalMapSize[diffuseMapIndex].xy, diffuseMapIndex)).a;
	}
	#endif
	return alpha;
}

float getMatSpecularTint(int materialIndex) {
	return materials.alphaSpecularTintSheenSheenTint[materialIndex].y;
}

float getMatSheen(int materialIndex) {
	return materials.alphaSpecularTintSheenSheenTint[materialIndex].z;
}

float getMatSheenTint(int materialIndex) {
	return materials.alphaSpecularTintSheenSheenTint[materialIndex].w;
}

// clearcoaRoughnessSubfaceTransmission
float getMatClearcoat(int materialIndex) {
	return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].x;
}

float getMatClearcoatRoughness(int materialIndex) {
	return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].y;
}

float getMatSubface(int materialIndex) {
	return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].z;
}

float getMatTransmission(int materialIndex) {
	return materials.clearcoaRoughnessSubfaceTransmission[materialIndex].w;
}

// iorAtDistanceAnisotropicWorkflow
float getMatIOR(int materialIndex) {
	return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].x;
}

float getMatAtDistance(int materialIndex) {
	return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].y;
}

float getMatAnisotropic(int materialIndex) {
	return materials.iorAtDistanceAnisotropicWorkflow[materialIndex].z;
}

vec3 getMatExtinction(int materialIndex) {
	return materials.extinction[materialIndex].rgb;
}