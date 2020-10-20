console.clear();
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.121.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/controls/OrbitControls.js";

import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.121.1/examples/jsm/postprocessing/UnrealBloomPass.js";

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 100);
camera.position.set(7, 12, 7).setLength(15);
let renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

let controls = new OrbitControls(camera, renderer.domElement);

let light = new THREE.DirectionalLight(0xffffff, 0.75);
light.position.setScalar(10);
scene.add(light);
let lightBack = new THREE.DirectionalLight(0xffffff, 0.75);
lightBack.position.set(-5, -2, -10);
scene.add(lightBack);
scene.add(new THREE.AmbientLight(0xffffff, 0.75))

//scene.add(new THREE.GridHelper(2, 2));

let mainContainer = new THREE.Object3D();
scene.add(mainContainer);

let logo = textureLogo();

let m = new THREE.MeshStandardMaterial({ color: "silver", roughness: 1, metalness: 0.75, wireframe: false, roughnessMap: logo });
//m.extensions = {derivatives: true};
let uniforms = {
    globalBloom: { value: 0 }
}
m.onBeforeCompile = shader => {
    shader.uniforms.globalBloom = uniforms.globalBloom;
    shader.vertexShader = `
  attribute vec3 IColor;
  attribute vec3 center;
  attribute float showWire;
  attribute float glowIntensity;
  attribute float emissionIntensity;
  attribute float canDraw;
  attribute float drawSide;

  varying vec3 vIColor;
  varying vec3 vCenter;
  varying float vShowWire;
  varying float vGlowIntensity;
  varying float vEmissionIntensity;
  varying float vCanDraw;
  varying float vDrawSide;

  ${shader.vertexShader}
`.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
    vIColor = IColor;
    vCenter = center;
    vShowWire = showWire;
    vGlowIntensity = glowIntensity;
    vEmissionIntensity = emissionIntensity;
    vCanDraw = canDraw;
    vDrawSide = drawSide;
`
    );
    //console.log(shader.vertexShader);

    shader.fragmentShader = `
  uniform float globalBloom;

  varying vec3 vIColor;
  varying vec3 vCenter;
  varying float vShowWire;
  varying float vGlowIntensity;
  varying float vEmissionIntensity;
  varying float vCanDraw;
  varying float vDrawSide;

  ${shader.fragmentShader}
`.replace(
        `#include <clipping_planes_pars_fragment>`,
        `#include <clipping_planes_pars_fragment>
    
  float edgeFactorTri() {
    vec3 d = fwidth( vCenter.xyz );
    vec3 a3 = smoothstep( vec3( 0.0 ), d * 1.5, vCenter.xyz );
    return min( min( a3.x, a3.y ), a3.z );
  }
`
    )
        .replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
    gl_FragColor = globalBloom > 0.5 ? vec4(0, 0, 0, 1) : gl_FragColor;

    float edgeFactor = edgeFactorTri();
    vec3 iColor = globalBloom > 0.5 ? vIColor * vGlowIntensity : mix(vIColor, vec3(1), vGlowIntensity);

    float emi = clamp(sin(vEmissionIntensity * PI), 0., 1.);
    vec3 c = mix(gl_FragColor.rgb, vIColor * 0.125, emi);

    vec3 color = mix(iColor, c, edgeFactor);
    color = mix(gl_FragColor.rgb, color, vShowWire);

    gl_FragColor = vec4(color, gl_FragColor.a);

    if (vCanDraw > 0.0 && globalBloom < 0.5 && vDrawSide > 0.5) {
      //gl_FragColor.rgb += vec3(0.75, 0.5, 0.5);
    }

`
        )
    // console.log(shader.fragmentShader);
}

let dummy = new THREE.Object3D();
let mat4 = new THREE.Matrix4();
// Tetrahedons ==============================================================================
let g = Tetrahedron();

let tetrahedra = new THREE.InstancedMesh(g, m, 24);

let tetraSize = new THREE.Vector3();
g.boundingBox.getSize(tetraSize);
let params = {
    tier: {
        x: g.boundingBox.max.x,
        z: g.boundingBox.max.z
    },
    row: {
        x: tetraSize.x,
        y: tetraSize.y,
        z: tetraSize.z
    }
}

mainContainer.add(tetrahedra);
// ==============================================================================================

// Octahedrons ==================================================================================
let gOct = Octahedron();
//let gMat = new THREE.MeshStandardMaterial({color: 0xaaaaaa, roughness: 0.25, metalness: 0.25, wireframe: false, roughnessMap: logo});

let octahedra = new THREE.InstancedMesh(gOct, m, 10);
mainContainer.add(octahedra);
// ==============================================================================================

// instances ====================================================================================
let united = [];

let tetraClrs = [];
let octaClrs = [];

let colorOuter = new THREE.Color(0xff7f7f);
let colorInner = new THREE.Color(0xff7fff);
let colorMidst = new THREE.Color().copy(colorOuter).lerp(colorInner, 0.5);

setInstances(tetrahedra, 4, 3, 0, 0, tetraClrs, colorOuter);
setInstances(octahedra, 3, tetraSize.y * 3 / 2, 0, 0, octaClrs, colorMidst);
setInstances(tetrahedra, 2, tetraSize.y * (3 / 4), Math.PI, 20, tetraClrs, colorInner);

g.setAttribute("IColor", new THREE.InstancedBufferAttribute(new Float32Array(tetraClrs), 3));
gOct.setAttribute("IColor", new THREE.InstancedBufferAttribute(new Float32Array(octaClrs), 3));

g.setAttribute("showWire", new THREE.InstancedBufferAttribute(new Float32Array(24).fill(0), 1));
g.setAttribute("glowIntensity", new THREE.InstancedBufferAttribute(new Float32Array(24).fill(0), 1));
g.setAttribute("emissionIntensity", new THREE.InstancedBufferAttribute(new Float32Array(24).fill(0), 1));
g.setAttribute("drawSide", new THREE.InstancedBufferAttribute(new Float32Array([
    1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0
]), 1));

gOct.setAttribute("showWire", new THREE.InstancedBufferAttribute(new Float32Array(10).fill(0), 1));
gOct.setAttribute("glowIntensity", new THREE.InstancedBufferAttribute(new Float32Array(10).fill(0), 1));
gOct.setAttribute("emissionIntensity", new THREE.InstancedBufferAttribute(new Float32Array(10).fill(0), 1));
gOct.setAttribute("drawSide", new THREE.InstancedBufferAttribute(new Float32Array([
    1, 1, 1, 0, 1, 1, 0, 1, 0, 0
]), 1));
// ==============================================================================================

// bloom /////////////////////////////////////////////////////////////////////////////////////////
var renderScene = new RenderPass(scene, camera);
var bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
);
bloomPass.threshold = 0;
bloomPass.strength = 1.25;
bloomPass.radius = 0.125;

var bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

var finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
        uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: bloomComposer.renderTarget2.texture }
        },
        vertexShader: `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
`,
        fragmentShader: `
			uniform sampler2D baseTexture;
			uniform sampler2D bloomTexture;
			varying vec2 vUv;
			void main() {
				gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
			}
`,
        defines: {}
    }),
    "baseTexture"
);
finalPass.needsSwap = true;

var finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderScene);
finalComposer.addPass(finalPass);
//////////////////////////////////////////////////////////////////////////////////////////////////
window.onresize = function () {
    var width = window.innerWidth;
    var height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);

    bloomComposer.setSize(width, height);
    finalComposer.setSize(width, height);
};
/////////////////////////////////////////////////////////////////////////////////////////////////


// run sequences
console.log(united);
united.forEach(u => {
    u.sequence();
});

// =============
let clock = new THREE.Clock();

renderer.setAnimationLoop(() => {

    let t = clock.getElapsedTime();

    mainContainer.rotation.y = -t * Math.PI * 0.0625;

    uniforms.globalBloom.value = 1;
    renderer.setClearColor(0x000000);
    bloomComposer.render();
    uniforms.globalBloom.value = 0;
    renderer.setClearColor(0x100510);
    finalComposer.render();

    //renderer.render(scene, camera);
});

// functions ====================================================================================

function instanceItem(instanceMesh, index, totalIndex, state) {
    return {
        mesh: instanceMesh,
        index: index,
        totalIndex: totalIndex,
        initState: state.clone(),
        dummy: new THREE.Object3D(),
        sequence: function () {

            let item = this;

            let showWire = { value: 0 };
            let glowIntensity = { value: 0 };
            let posLength = { value: 1 };

            let attrs = item.mesh.geometry.attributes;

            let tween = gsap.timeline({ delay: 3 + item.totalIndex * 0.2 })
                .to(posLength, {
                    value: 2, duration: 5, ease: "elastic.out(1.5, 1)",
                    onUpdate: function () {
                        item.dummy.copy(item.initState);

                        item.dummy.position.multiplyScalar(posLength.value);

                        let rot = Math.PI * (6 / 3) * ((posLength.value - 1) / 1);
                        item.dummy.rotation.y = rot;

                        item.dummy.updateMatrix();
                        item.mesh.setMatrixAt(item.index, item.dummy.matrix);
                        item.mesh.instanceMatrix.needsUpdate = true;
                    }
                })
                .to(showWire, {
                    value: 1, duration: 5, delay: -8,
                    onUpdate: function () {
                        attrs.showWire.setX(item.index, showWire.value);
                        attrs.showWire.needsUpdate = true;
                    }
                })
                .to(glowIntensity, {
                    value: 1, duration: 0.5, ease: "elastic.out(1, 0.2)",
                    onUpdate: function () {
                        attrs.glowIntensity.setX(item.index, glowIntensity.value);
                        attrs.glowIntensity.needsUpdate = true;
                        attrs.emissionIntensity.setX(item.index, glowIntensity.value);
                        attrs.emissionIntensity.needsUpdate = true;
                    }
                })
                .to(posLength, {
                    value: 1, duration: 5, delay: 5 + 6.6 - item.totalIndex * 0.2,
                    onUpdate: function () {
                        item.dummy.copy(item.initState);
                        item.dummy.position.multiplyScalar(posLength.value);
                        item.dummy.rotation.y = 0;
                        item.dummy.updateMatrix();
                        item.mesh.setMatrixAt(item.index, item.dummy.matrix);
                        item.mesh.instanceMatrix.needsUpdate = true;
                    }
                })
                .to(showWire, {
                    value: 0, duration: 3,
                    onUpdate: function () {
                        glowIntensity.value = showWire.value;
                        attrs.showWire.setX(item.index, showWire.value);
                        attrs.glowIntensity.setX(item.index, showWire.value);
                        attrs.showWire.needsUpdate = true;
                        attrs.glowIntensity.setX(item.index, showWire.value);
                        attrs.glowIntensity.needsUpdate = true;
                    }
                });

            if (totalIndex == 33) {
                tween.eventCallback("onComplete", function () {
                    united.forEach(u => {
                        u.sequence();
                    });
                })
            }
        }
    }
}

function textureLogo() {
    let c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    let ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "black";

    let step = (0.75 / 4) * c.width;

    let baseVector = new THREE.Vector2(0, 128);

    for (let i = 0; i < 3; i++) {
        let rv = baseVector.clone().rotateAround(new THREE.Vector2(), i * Math.PI * 2 / 3);
        ctx.translate(Math.round(128 + rv.x), Math.round(128 - rv.y));
        ctx.rotate(-i * Math.PI * 2 / 3);
        for (let j = 0; j < 5; j++) {
            let y = Math.round(step * j);
            ctx.fillRect(-128, y - 4, 256, 8);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    return new THREE.CanvasTexture(c);
}

function setInstances(instGeom, tiers, initTierTop, initRotation, initCount, colorsArray, color) {
    let count = initCount;
    for (let tier = 0; tier < tiers; tier++) {
        let tierInitX = params.tier.x * tier;

        for (let row = 0; row <= tier; row++) {

            let rowInitZ = params.row.z * 0.5 * row;

            for (let col = 0; col <= row; col++) {

                dummy.rotation.x = initRotation;
                dummy.rotation.y = initRotation;
                dummy.position.set(
                    tierInitX - (params.row.x * row),
                    initTierTop - (params.row.y * tier),
                    rowInitZ - (params.row.z * col)
                );
                let totalIndex = united.length;
                united.push(instanceItem(instGeom, count, totalIndex, dummy))
                //dummy.position.multiplyScalar(1.5);

                dummy.updateMatrix();
                instGeom.setMatrixAt(count, dummy.matrix);

                colorsArray.push(color.r, color.g, color.b);

                count++;

            }
            //console.log(count);
        }
    }
}

function Octahedron() {
    let h = 1.3333333432674408; // height of tetrahedon
    let hh = h * 0.5;
    var pts = [
        new THREE.Vector3(Math.sqrt(8 / 9), hh, 0),
        new THREE.Vector3(-Math.sqrt(2 / 9), hh, Math.sqrt(2 / 3)),
        new THREE.Vector3(-Math.sqrt(2 / 9), hh, -Math.sqrt(2 / 3)),

        new THREE.Vector3(-Math.sqrt(8 / 9), -hh, 0),
        new THREE.Vector3(Math.sqrt(2 / 9), -hh, -Math.sqrt(2 / 3)),
        new THREE.Vector3(Math.sqrt(2 / 9), -hh, Math.sqrt(2 / 3))
    ];

    var faces = [
        pts[0].clone(), pts[2].clone(), pts[1].clone(),
        pts[3].clone(), pts[4].clone(), pts[5].clone(),

        pts[0].clone(), pts[5].clone(), pts[4].clone(),
        pts[1].clone(), pts[3].clone(), pts[5].clone(),
        pts[2].clone(), pts[4].clone(), pts[3].clone(),

        pts[3].clone(), pts[1].clone(), pts[2].clone(),
        pts[4].clone(), pts[2].clone(), pts[0].clone(),
        pts[5].clone(), pts[0].clone(), pts[1].clone()
    ];

    var uvs = [];
    for (let i = 0; i < 8; i++) {
        uvs.push(
            0.5,
            1,
            0.06698729810778059,
            0.2500000000000001,
            0.9330127018922194,
            0.2500000000000001
        )
    };

    let g = new THREE.BufferGeometry().setFromPoints(faces);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    setupCenters(g);
    g.setAttribute("canDraw", new THREE.Float32BufferAttribute([
        0, 0, 0,
        0, 0, 0,

        0, 0, 0,
        0, 0, 0,
        0, 0, 0,

        0, 0, 0,
        0, 0, 0,
        1, 1, 1
    ], 1));
    return g;
}

function Tetrahedron() {
    // https://discourse.threejs.org/t/tetrahedron-non-indexed-buffer-geometry/12542
    // tetrahedron
    // ---------------------------------------------------------------------------------------
    var pts = [
        // https://en.wikipedia.org/wiki/Tetrahedron#Coordinates_for_a_regular_tetrahedron
        new THREE.Vector3(Math.sqrt(8 / 9), 0, -(1 / 3)),
        new THREE.Vector3(-Math.sqrt(2 / 9), Math.sqrt(2 / 3), -(1 / 3)),
        new THREE.Vector3(-Math.sqrt(2 / 9), -Math.sqrt(2 / 3), -(1 / 3)),
        new THREE.Vector3(0, 0, 1)
    ];

    var faces = [
        //triangle soup
        pts[0].clone(), pts[2].clone(), pts[1].clone(),
        pts[0].clone(), pts[1].clone(), pts[3].clone(),
        pts[1].clone(), pts[2].clone(), pts[3].clone(),
        pts[2].clone(), pts[0].clone(), pts[3].clone()
    ];

    var geom = new THREE.BufferGeometry().setFromPoints(faces);
    geom.rotateX(-Math.PI * 0.5);
    geom.computeVertexNormals();

    geom.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
            [
                // UVs
                0.5, 1, 0.06698729810778059, 0.2500000000000001, 0.9330127018922194, 0.2500000000000001,
                0.06698729810778059, 0.2500000000000001, 0.9330127018922194, 0.2500000000000001, 0.5, 1,
                0.06698729810778059, 0.2500000000000001, 0.9330127018922194, 0.2500000000000001, 0.5, 1,
                0.06698729810778059, 0.2500000000000001, 0.9330127018922194, 0.2500000000000001, 0.5, 1
            ],
            2
        )
    );
    // ---------------------------------------------------------------------------------------
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    setupCenters(geom);
    geom.setAttribute("canDraw", new THREE.Float32BufferAttribute([ //which face is intended to draw
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        1, 1, 1
    ], 1))
    return geom;
}

function setupCenters(geometry) {

    var vectors = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1)
    ];

    var position = geometry.attributes.position;
    var centers = new Float32Array(position.count * 3);

    for (var i = 0, l = position.count; i < l; i++) {

        vectors[i % 3].toArray(centers, i * 3);

    }

    geometry.setAttribute('center', new THREE.BufferAttribute(centers, 3));

}