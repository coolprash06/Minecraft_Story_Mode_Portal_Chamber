/**
 * Soft 4-tap filter for the shadow pool's point lights, patched into three's shader chunk once at
 * startup, before any program compiles (fixed for the session).
 *
 * Measured on the Arc 140T (ANGLE/D3D11, 2561×1395): three's PCF point shadows sample the depth cube
 * with hardware depth-compare + linear filtering, and that sampling path alone costs ~2.5 ms per
 * frame for the 2 pool lights, almost regardless of the tap count (1 tap saves only ~0.9 of it).
 * Point-sampled (Basic) reads of the same depth cube are cheap.
 *
 * So the renderer runs with BasicShadowMap (plain depth cube, nearest, no compare: see Experience),
 * and this replaces Basic's single hard tap with a soft filter: 4 point-sampled compares on a
 * per-pixel rotated Vogel disk with the same radius as before (light.shadow.radius texels), averaged.
 * Same footprint, so the same softness; the penumbra is dithered from 4 samples instead of 5
 * bilinear ones, so it's a touch grainier up close.
 *
 * Also: an early out before any filter maths for pixels outside the shadow camera's [near, far],
 * explicit zero gradients (textureGrad → level 0, identical: shadow maps have no mips), so the
 * taps can sit behind a real branch on D3D, and a constant disk rotated once per pixel (the per-tap
 * sqrt/sin/cos made the shader heavy enough to eat most of the saving).
 *
 * Measurement knobs: ?shadowtype=percentage (three's stock PCF filter, the previous look),
 * ?shadowfilter=three (Basic's stock single hard tap), ?shadowtaps=N (1..8, default 4).
 */
import { ShaderChunk } from 'three'

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const STOCK = params.get('shadowfilter') === 'three'
const TAPS = Math.min(8, Math.max(1, Math.round(Number(params.get('shadowtaps')) || 4)))

/** Vogel disk (golden-angle spiral), the same points three's filter uses, unrotated. */
const DISK = Array.from({ length: TAPS }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / TAPS)
  const t = i * 2.399963229728653
  return `vec2( ${(Math.cos(t) * r).toFixed(6)}, ${(Math.sin(t) * r).toFixed(6)} )`
})

const filter = /* glsl */ `const vec2 SHADOW_DISK[ ${TAPS} ] = vec2[]( ${DISK.join(', ')} );

	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {

		// light → fragment (vPointShadowCoord is re-purposed for point lights)
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		// cube faces store depth along their own axis
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ > shadowCameraFar || viewSpaceZ < shadowCameraNear ) return 1.0;

		float lightDistance = length( lightToPosition );
		vec3 bd3D = lightToPosition / lightDistance;
		float depthRange = shadowCameraFar - shadowCameraNear;
		// perspective depth of the point at direction * lightDistance, as seen by whichever face it lands on
		float depthA = shadowCameraFar / depthRange + shadowBias;
		float depthB = - shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );

		float texelSize = shadowRadius / shadowMapSize.x;
		vec3 absDir = abs( bd3D );
		vec3 tangent = normalize( cross( bd3D, absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) );
		vec3 bitangent = cross( bd3D, tangent );
		// the Vogel disk is fixed; one sin/cos per pixel rotates it (instead of sqrt/sin/cos per tap)
		float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
		float cs = cos( phi ) * texelSize;
		float sn = sin( phi ) * texelSize;
		vec3 du = tangent * cs + bitangent * sn;
		vec3 dv = bitangent * cs - tangent * sn;

		float shadow = 0.0;
		for ( int i = 0; i < ${TAPS}; i ++ ) {
			vec2 offset = SHADOW_DISK[ i ];
			vec3 direction = bd3D + du * offset.x + dv * offset.y;
			vec3 absDirection = abs( direction );
			float dp = depthA + depthB / max( max( absDirection.x, absDirection.y ), absDirection.z );
			float depth = textureGrad( shadowMap, direction, vec3( 0.0 ), vec3( 0.0 ) ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow += step( dp, depth );
		}
		shadow *= ${(1 / TAPS).toFixed(6)};

		return mix( 1.0, shadow, shadowIntensity );

	}`

let installed = false
export function installShadowFilter() {
  if (installed || STOCK) return
  installed = true
  const src = ShaderChunk.shadowmap_pars_fragment
  const start = src.indexOf('float getPointShadow( samplerCube shadowMap')
  // end of that function: its matching closing brace
  let end = -1
  for (let i = src.indexOf('{', start), depth = 0; start >= 0 && i >= 0 && i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) {
      end = i + 1
      break
    }
  }
  // the Basic branch needs these helpers, which three only defines under PCF
  const helpers = /* glsl */ `
	#if !defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
	#endif
	`
  if (start < 0 || end < 0) {
    console.warn('shadowFilter: three shadow chunk changed; keeping the stock filter')
    return
  }
  ShaderChunk.shadowmap_pars_fragment = src.slice(0, start) + helpers + filter + src.slice(end)
}
installShadowFilter()
