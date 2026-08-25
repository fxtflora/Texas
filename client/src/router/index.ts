import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Hall',
      component: () => import('@/pages/Hall.vue'),
    },
    {
      path: '/join/:code',
      name: 'JoinRoom',
      component: () => import('@/pages/Hall.vue'),   // Hall 检测到 code 参数自动填入
    },
    {
      path: '/room/:code/lobby',
      name: 'Lobby',
      component: () => import('@/pages/Lobby.vue'),
    },
    {
      path: '/room/:code/table',
      name: 'Table',
      component: () => import('@/pages/Table.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
