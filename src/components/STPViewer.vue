<template>
  <div class="stp-viewer">
    <!-- Header -->
    <header class="viewer-header">
      <div class="header-content">
        <div class="header-left">
          <h1 class="viewer-title">
            <span class="icon">📐</span>
            STP File Viewer
          </h1>
          <p class="viewer-subtitle">Upload and visualize STP/STEP files in your browser</p>
        </div>
        <div class="header-right">
          <div class="file-info" v-if="modelInfo">
            <span class="file-type">{{ fileType }}</span>
            <span class="file-size">{{ modelInfo.fileSize }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Controls -->
    <div class="controls-panel">
      <div class="file-controls">
        <input 
          type="file" 
          @change="handleFileUpload" 
          accept=".stp,.step"
          ref="fileInput"
          class="file-input"
        />
        <button @click="fileInput && fileInput.click()" class="btn btn-primary">
          <span class="icon">📁</span>
          Choose STP File
        </button>
        <div class="drag-hint" v-if="!hasModel">
          <span>or drag & drop your file here</span>
        </div>
      </div>

      <div class="view-controls" v-if="hasModel">
        <button @click="resetCamera" class="btn btn-outline">
          <span class="icon">🎯</span>
          Reset View
        </button>
        <button @click="toggleWireframe" class="btn btn-outline">
          <span class="icon">{{ wireframe ? '🔲' : '⬜' }}</span>
          {{ wireframe ? 'Solid' : 'Wireframe' }}
        </button>
        <button @click="toggleGrid" class="btn btn-outline">
          <span class="icon">{{ showGrid ? '⊞' : '⊠' }}</span>
          {{ showGrid ? 'Hide Grid' : 'Show Grid' }}
        </button>
        <select v-model="selectedMesh" @change="focusOnMesh" class="mesh-select" v-if="meshes.length > 1">
          <option value="">All Parts</option>
          <option v-for="(mesh, index) in meshes" :key="index" :value="index">
            {{ mesh.name || `Part ${index + 1}` }}
          </option>
        </select>
      </div>
    </div>

    <!-- 3D Canvas Container -->
    <div 
      ref="canvasContainer" 
      class="canvas-container"
      @dragover.prevent
      @dragenter.prevent
      @drop="handleFileDrop"
      :class="{ 'drag-over': isDragOver }"
    >
      <!-- Loading Overlay -->
      <div v-if="loading" class="overlay loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <h3>Loading STP File</h3>
          <p>{{ loadingStatus }}</p>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: loadingProgress + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Error Overlay -->
      <div v-if="error" class="overlay error-overlay">
        <div class="error-content">
          <div class="error-icon">⚠️</div>
          <h3>Error Loading File</h3>
          <p>{{ error }}</p>
          <button @click="clearError" class="btn btn-danger">Try Again</button>
        </div>
      </div>

      <!-- Drop Zone -->
      <div v-if="!hasModel && !loading && !error" class="overlay drop-zone">
        <div class="drop-content">
          <div class="drop-icon">📁</div>
          <h3>Drop your STP file here</h3>
          <p>Supports .stp and .step files</p>
          <button @click="fileInput && fileInput.click()" class="btn btn-primary large">
            <span class="icon">📁</span>
            Browse Files
          </button>
        </div>
      </div>
    </div>

    <!-- Info Panel -->
    <div class="info-panel" v-if="modelInfo">
      <div class="info-header">
        <h3>
          <span class="icon">ℹ️</span>
          Model Information
        </h3>
        <button @click="toggleInfoPanel" class="toggle-btn">
          {{ showInfoPanel ? '▼' : '▲' }}
        </button>
      </div>
      
      <div v-show="showInfoPanel" class="info-content">
        <div class="info-grid">
          <div class="info-card">
            <div class="info-label">File Type</div>
            <div class="info-value">{{ fileType }}</div>
          </div>
          <div class="info-card">
            <div class="info-label">File Size</div>
            <div class="info-value">{{ modelInfo.fileSize }}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Parts</div>
            <div class="info-value">{{ modelInfo.meshCount || 1 }}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Vertices</div>
            <div class="info-value">{{ modelInfo.totalVertices.toLocaleString() }}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Faces</div>
            <div class="info-value">{{ modelInfo.totalFaces.toLocaleString() }}</div>
          </div>
        </div>
        
        <div v-if="meshes.length > 1" class="mesh-details">
          <h4>Part Details</h4>
          <div class="mesh-list">
            <div v-for="(mesh, index) in meshes" :key="index" class="mesh-item">
              <div class="mesh-color" :style="{ backgroundColor: mesh.colorHex }"></div>
              <div class="mesh-info">
                <div class="mesh-name">{{ mesh.name || `Part ${index + 1}` }}</div>
                <div class="mesh-stats">{{ mesh.vertices.toLocaleString() }} vertices, {{ mesh.faces.toLocaleString() }} faces</div>
              </div>
              <button @click="focusOnSingleMesh(index)" class="btn btn-outline small">
                Focus
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Reactive state
const meshes = ref([])
const loading = ref(false)
const loadingStatus = ref('')
const loadingProgress = ref(0)
const error = ref(null)
const wireframe = ref(false)
const showGrid = ref(true)
const showInfoPanel = ref(true)
const modelInfo = ref(null)
const selectedMesh = ref('')
const fileType = ref('')
const isDragOver = ref(false)

// Non-reactive instance fields
let scene = null
let camera = null
let renderer = null
let controls = null
let gridHelper = null
let isDestroyed = false

// OCCT
let occt = null
const occtLoaded = ref(false)

// Refs
const canvasContainer = ref(null)
const fileInput = ref(null)

const hasModel = computed(() => meshes.value.length > 0)

async function loadOCCTLibrary() {
  try {
    loadingStatus.value = 'Loading OCCT library...'
    let occtimportjs
    try {
      occtimportjs = (await import('occt-import-js')).default
    } catch (importError) {
      console.error('Failed to import occt-import-js:', importError)
      throw importError
    }
    occt = await occtimportjs({
      locateFile: (path) => {
        if (path.endsWith('.wasm')) {
          return '/occt-import-js.wasm'
        }
        return path
      }
    })
    occtLoaded.value = true
  } catch (e) {
    console.error('OCCT library loading failed:', e)
    occtLoaded.value = false
    error.value = 'Failed to load OCCT library. Please refresh the page and try again. Error: ' + e.message
  }
}

function initThreeJS() {
  const container = canvasContainer.value
  const width = container.clientWidth
  const height = container.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf5f5f5)

  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000)
  camera.position.set(100, 100, 100)
  camera.updateMatrixWorld()

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.screenSpacePanning = false
  controls.minDistance = 1
  controls.maxDistance = 1000

  const ambientLight = new THREE.AmbientLight(0x404040, 0.4)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(100, 100, 50)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  scene.add(directionalLight)

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3)
  scene.add(hemisphereLight)

  gridHelper = new THREE.GridHelper(200, 20, 0x888888, 0xcccccc)
  scene.add(gridHelper)

  window.addEventListener('resize', onWindowResize)
}

function handleFileUpload(event) {
  const file = event.target.files[0]
  if (file) {
    loadFile(file)
  }
}

function handleFileDrop(event) {
  event.preventDefault()
  isDragOver.value = false
  const file = event.dataTransfer.files[0]
  if (file) {
    const fileName = file.name.toLowerCase()
    if (fileName.endsWith('.stp') || fileName.endsWith('.step')) {
      loadFile(file)
    } else {
      error.value = 'Unsupported file format. Please use STP or STEP files.'
    }
  }
}

async function loadFile(file) {
  const fileName = file.name.toLowerCase()
  if (fileName.endsWith('.stp') || fileName.endsWith('.step')) {
    fileType.value = 'STP/STEP'
    if (!occtLoaded.value) {
      loading.value = true
      loadingStatus.value = 'Loading OCCT library...'
      await loadOCCTLibrary()
      loading.value = false
    }
    if (occtLoaded.value) {
      await loadSTPFile(file)
    } else {
      error.value = 'STP/STEP file support requires the occt-import-js library. Please refresh the page and try again. If the problem persists, check the browser console for more details.'
    }
  } else {
    error.value = 'Unsupported file format'
  }
}

async function loadSTPFile(file) {
  loading.value = true
  error.value = null
  loadingProgress.value = 0
  loadingStatus.value = 'Reading file...'
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file)
    loadingProgress.value = 30
    loadingStatus.value = 'Parsing STEP geometry...'
    const fileBuffer = new Uint8Array(arrayBuffer)
    const result = occt.ReadStepFile(fileBuffer)
    if (!result.success) {
      throw new Error('Failed to parse STEP file')
    }
    loadingProgress.value = 70
    loadingStatus.value = 'Creating 3D meshes...'
    await createMeshesFromOCCTResult(result, file)
    loadingProgress.value = 100
    loading.value = false
    loadingStatus.value = ''
  } catch (e) {
    console.error('Error loading STP file:', e)
    error.value = 'Failed to load STP file: ' + e.message
    loading.value = false
    loadingStatus.value = ''
    loadingProgress.value = 0
  }
}

async function createMeshesFromOCCTResult(result, file) {
  clearMeshes()
  const meshData = []
  let totalVertices = 0
  let totalFaces = 0
  for (let i = 0; i < result.meshes.length; i++) {
    const meshInfo = result.meshes[i]
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(meshInfo.attributes.position.array)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    if (meshInfo.attributes.normal) {
      const normals = new Float32Array(meshInfo.attributes.normal.array)
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    } else {
      geometry.computeVertexNormals()
    }
    if (meshInfo.index) {
      const indices = new Uint32Array(meshInfo.index.array)
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    }
    let color = new THREE.Color(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6)
    let colorHex = '#' + color.getHexString()
    if (meshInfo.color && meshInfo.color.length >= 3) {
      color = new THREE.Color(meshInfo.color[0], meshInfo.color[1], meshInfo.color[2])
      colorHex = '#' + color.getHexString()
    }
    const material = new THREE.MeshPhongMaterial({
      color: color,
      wireframe: wireframe.value,
      side: THREE.DoubleSide
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    const vertices = positions.length / 3
    const faces = meshInfo.index ? meshInfo.index.array.length / 3 : vertices / 3
    meshData.push({
      mesh: mesh,
      name: meshInfo.name || `Part ${i + 1}`,
      vertices: vertices,
      faces: faces,
      colorHex: colorHex
    })
    totalVertices += vertices
    totalFaces += faces
  }
  meshes.value = meshData
  modelInfo.value = {
    meshCount: result.meshes.length,
    totalVertices: totalVertices,
    totalFaces: totalFaces,
    fileSize: formatFileSize(file.size)
  }
  fitCameraToModel()
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve(event.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

function clearMeshes() {
  meshes.value.forEach(meshData => {
    if (meshData.mesh && scene) {
      scene.remove(meshData.mesh)
      meshData.mesh.geometry?.dispose()
      meshData.mesh.material?.dispose()
    }
  })
  meshes.value = []
  modelInfo.value = null
  selectedMesh.value = ''
}

function fitCameraToModel() {
  if (meshes.value.length === 0) return
  const box = new THREE.Box3()
  meshes.value.forEach(meshData => {
    box.expandByObject(meshData.mesh)
  })
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const distance = maxDim * 1.5
  camera.position.set(center.x + distance, center.y + distance, center.z + distance)
  camera.lookAt(center)
  controls.target.copy(center)
  controls.update()
}

function resetCamera() {
  fitCameraToModel()
}

function toggleWireframe() {
  wireframe.value = !wireframe.value
  meshes.value.forEach(meshData => {
    meshData.mesh.material.wireframe = wireframe.value
  })
}

function toggleGrid() {
  showGrid.value = !showGrid.value
  if (gridHelper) gridHelper.visible = showGrid.value
}

function toggleInfoPanel() {
  showInfoPanel.value = !showInfoPanel.value
}

function focusOnMesh() {
  if (selectedMesh.value === '') {
    meshes.value.forEach(meshData => {
      meshData.mesh.visible = true
    })
    fitCameraToModel()
  } else {
    focusOnSingleMesh(selectedMesh.value)
  }
}

function focusOnSingleMesh(index) {
  meshes.value.forEach((meshData, i) => {
    meshData.mesh.visible = i == index
  })
  const selectedMeshData = meshes.value[index]
  if (selectedMeshData) {
    const box = new THREE.Box3().setFromObject(selectedMeshData.mesh)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 2
    camera.position.set(center.x + distance, center.y + distance, center.z + distance)
    camera.lookAt(center)
    controls.target.copy(center)
    controls.update()
  }
  selectedMesh.value = index.toString()
}

function clearError() {
  error.value = null
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function onWindowResize() {
  const container = canvasContainer.value
  const width = container.clientWidth
  const height = container.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function animate() {
  if (isDestroyed) return
  requestAnimationFrame(animate)
  if (controls) controls.update()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

function disposeThreeJS() {
  meshes.value.forEach(meshData => {
    if (meshData.mesh) {
      scene?.remove(meshData.mesh)
      meshData.mesh.geometry?.dispose()
      meshData.mesh.material?.dispose()
    }
  })
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  scene = null
  camera = null
  controls = null
  gridHelper = null
}

onMounted(() => {
  initThreeJS()
  animate()
  loadOCCTLibrary()
})

onBeforeUnmount(() => {
  isDestroyed = true
  disposeThreeJS()
  window.removeEventListener('resize', onWindowResize)
})
</script>

<style scoped>
.stp-viewer {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #f8f9fa;
}

.viewer-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.header-left {
  flex: 1;
}

.viewer-title {
  margin: 0 0 5px 0;
  font-size: 1.8em;
  font-weight: 300;
  display: flex;
  align-items: center;
  gap: 10px;
}

.viewer-subtitle {
  margin: 0;
  opacity: 0.9;
  font-size: 0.9em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
}

.file-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.file-type {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 500;
}

.file-size {
  font-size: 0.8em;
  opacity: 0.8;
}

.controls-panel {
  padding: 15px 20px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}

.file-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.file-input {
  display: none;
}

.drag-hint {
  color: #6c757d;
  font-size: 0.9em;
  font-style: italic;
}

.view-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.mesh-select {
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  background: white;
  font-size: 0.9em;
  min-width: 150px;
}

.canvas-container {
  flex: 1;
  position: relative;
  background: #ffffff;
  border: 2px dashed #dee2e6;
  margin: 0 20px;
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.3s ease;
}

.canvas-container.drag-over {
  border-color: #007bff;
  background: #f8f9ff;
}

.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 10;
}

.loading-overlay {
  color: #6c757d;
}

.loading-content {
  max-width: 300px;
}

.loading-content h3 {
  margin: 15px 0 10px 0;
  color: #495057;
}

.loading-content p {
  margin: 0 0 20px 0;
  color: #6c757d;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: #e9ecef;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007bff, #0056b3);
  transition: width 0.3s ease;
}

.error-overlay {
  color: #dc3545;
  max-width: 400px;
}

.error-content {
  text-align: center;
}

.error-icon {
  font-size: 3em;
  margin-bottom: 15px;
}

.error-content h3 {
  margin: 0 0 10px 0;
  color: #dc3545;
}

.error-content p {
  margin: 0 0 20px 0;
  color: #6c757d;
}

.drop-zone {
  color: #6c757d;
}

.drop-content {
  max-width: 300px;
}

.drop-icon {
  font-size: 4em;
  margin-bottom: 15px;
  opacity: 0.5;
}

.drop-content h3 {
  margin: 0 0 10px 0;
  color: #495057;
}

.drop-content p {
  margin: 0 0 20px 0;
  color: #6c757d;
}

.info-panel {
  background: white;
  border-top: 1px solid #e9ecef;
  margin: 0 20px 20px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.info-header {
  padding: 15px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-header h3 {
  margin: 0;
  color: #495057;
  font-size: 1.1em;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-btn {
  background: none;
  border: none;
  color: #6c757d;
  cursor: pointer;
  font-size: 1.2em;
  padding: 5px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.toggle-btn:hover {
  background: #e9ecef;
}

.info-content {
  padding: 20px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}

.info-card {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 6px;
  text-align: center;
  transition: transform 0.2s ease;
}

.info-card:hover {
  transform: translateY(-2px);
}

.info-label {
  font-size: 0.8em;
  color: #6c757d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}

.info-value {
  font-size: 1.2em;
  font-weight: 600;
  color: #495057;
}

.mesh-details h4 {
  margin: 0 0 15px 0;
  color: #495057;
  font-size: 1em;
  font-weight: 600;
}

.mesh-list {
  max-height: 200px;
  overflow-y: auto;
}

.mesh-item {
  display: flex;
  align-items: center;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 8px;
  transition: all 0.2s ease;
}

.mesh-item:hover {
  background: #e9ecef;
  transform: translateX(5px);
}

.mesh-color {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 1px #dee2e6;
  margin-right: 12px;
  flex-shrink: 0;
}

.mesh-info {
  flex: 1;
}

.mesh-name {
  font-weight: 600;
  color: #495057;
  margin-bottom: 2px;
}

.mesh-stats {
  font-size: 0.8em;
  color: #6c757d;
}

.btn.small {
  padding: 6px 12px;
  font-size: 0.8em;
}

.btn.large {
  padding: 12px 24px;
  font-size: 1em;
}

.icon {
  font-size: 1.1em;
}

/* Responsive Design */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  
  .controls-panel {
    flex-direction: column;
    align-items: stretch;
  }
  
  .view-controls {
    justify-content: center;
  }
  
  .canvas-container {
    margin: 0 10px;
  }
  
  .info-panel {
    margin: 0 10px 10px;
  }
  
  .info-grid {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
  }
}
</style>

