<script setup lang="ts">
import type { Emitter } from "mitt";
import { onBeforeUnmount } from "vue";
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import RDialog from "@/components/common/RDialog.vue";
import type { Events } from "@/types/emitter";
import { clearEmulatorJSCaches } from "@/utils/emulatorjsCache";

const { t } = useI18n();
const show = ref(false);

const emitter = inject<Emitter<Events>>("emitter");

const openCacheDialogHandler = () => {
  show.value = true;
};

emitter?.on("openEmulatorJSCacheDialog", openCacheDialogHandler);

onBeforeUnmount(() => {
  emitter?.off("openEmulatorJSCacheDialog", openCacheDialogHandler);
});

async function clearIndexDB() {
  const { blocked } = await clearEmulatorJSCaches();
  if (blocked.length > 0) {
    // Saying nothing here is what made the old behaviour invisible.
    console.warn("Could not clear EmulatorJS storage:", blocked.join(", "));
  }
  closeDialog();
}

function closeDialog() {
  show.value = false;
}
</script>

<template>
  <RDialog v-model="show" icon="mdi-database-remove" @close="closeDialog">
    <template #header>
      <v-row class="ml-2">
        {{ t("play.clear-cache") }}
      </v-row>
    </template>
    <template #content>
      <div class="text-h6 text-center pa-4">
        {{ t("play.clear-cache-title") }}
      </div>
      <div class="text-body-1 text-center px-4 pb-4">
        <strong>{{ t("play.clear-cache-warning") }}</strong>
        <br />
        {{ t("play.clear-cache-description") }}
      </div>
    </template>
    <template #footer>
      <v-row class="justify-center my-2" no-gutters>
        <v-btn-group divided density="compact">
          <v-btn class="bg-toplayer" @click="closeDialog">
            {{ t("common.cancel") }}
          </v-btn>
          <v-btn class="bg-toplayer text-romm-red" @click="clearIndexDB">
            {{ t("common.confirm") }}
          </v-btn>
        </v-btn-group>
      </v-row>
    </template>
  </RDialog>
</template>
