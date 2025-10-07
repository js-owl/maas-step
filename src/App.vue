<template>
  <div id="app">
    <STPViewer />
  </div>
</template>

<script>
import STPViewer from './components/STPViewer.vue'

export default {
  name: 'App',
  components: {
    STPViewer
  }
}
</script>

<style>
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>

