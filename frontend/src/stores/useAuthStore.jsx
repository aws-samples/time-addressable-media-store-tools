// stores/authStore.js
import { create } from "zustand";
import { getCurrentUser, signOut, fetchAuthSession } from "aws-amplify/auth";

export const useAuthStore = create((set) => ({
  user: null,
  userEmail: null,
  loading: true,
  isSigningOut: false,

  checkUser: async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();

      const email = session.tokens?.idToken?.payload?.email;

      set({
        user: currentUser,
        userEmail: email,
        loading: false,
        isSigningOut: false,
      });
    } catch (error) {
      console.log("No authenticated user:", error);
      set({ user: null, userEmail: null, loading: false });
    }
  },

  signOut: async () => {
    set({ isSigningOut: true });
    await signOut({ global: true });
    set({ user: null, userEmail: null });
  },
}));
