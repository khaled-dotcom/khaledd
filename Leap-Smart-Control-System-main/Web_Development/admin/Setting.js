import { db, auth } from "../src/js/firebase/firebaseConfig.js";
import { 
  doc, 
  getDoc, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";
import { initAdminAuthCheck } from '../src/js/firebase/adminAuthCheck.js';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

// Initialize admin auth check
initAdminAuthCheck();

// Function to get current admin data
async function getCurrentAdminData() {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        unsubscribe();
        reject(new Error('No user logged in'));
        return;
      }

      try {
        // Get user data directly from users collection using the user's UID
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
          unsubscribe();
          reject(new Error('No user data found'));
          return;
        }

        const userData = userDoc.data();
        unsubscribe();
        resolve({
          userName: userData.fullName || userData.displayName || user.displayName || 'Admin',
          image: userData.profilePicture || userData.image || user.photoURL || 'https://i.ibb.co/277hTSg8/generic-profile.jpg',
          email: user.email
        });
      } catch (error) {
        console.error('Error fetching admin data:', error);
        unsubscribe();
        reject(error);
      }
    });
  });
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async function() {
  // Menu Toggle Functionality
  const menuToggle = document.querySelector(".menu-toggle");
  const closeMenu = document.querySelector(".close-menu");
  const sidebar = document.querySelector(".sidebar");

  // Toggle menu - show sidebar when menu is clicked
  menuToggle.addEventListener("click", () => {
    sidebar.classList.add("active");
    menuToggle.style.display = "none";
  });

  // Close menu - hide sidebar when close is clicked
  closeMenu.addEventListener("click", () => {
    sidebar.classList.remove("active");
    menuToggle.style.display = "flex";
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
      sidebar.classList.remove("active");
      if (window.innerWidth <= 992) {
        menuToggle.style.display = "flex";
      }
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    if (window.innerWidth > 992) {
      menuToggle.style.display = "none";
      sidebar.classList.remove("active");
    } else if (!sidebar.classList.contains("active")) {
      menuToggle.style.display = "flex";
    }
  });

  // DOM Elements
  const loadingOverlay = document.getElementById('loading-overlay');
  const adminName = document.getElementById("adminName");
  const adminFullName = document.getElementById("adminFullName");
  const adminProfilePic = document.getElementById("adminProfilePic");
  const profileImagePreview = document.getElementById("profileImagePreview");
  const profileImage = document.getElementById("profileImage");
  const currentEmail = document.getElementById("currentEmail");
  const currentPassword = document.getElementById("currentPassword");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");
  const passwordModal = document.getElementById("passwordModal");
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Initialize the page
  async function initializePage() {
    try {
      const adminData = await getCurrentAdminData();
      
      // Set initial values
      adminName.textContent = getFirstName(adminData.userName);
      adminFullName.textContent = adminData.userName;
      
      // Set profile images with fallback
      const setProfileImage = (imgElement) => {
        imgElement.onerror = () => {
          imgElement.src = 'https://i.ibb.co/277hTSg8/generic-profile.jpg';
        };
        imgElement.src = adminData.image;
      };
      
      setProfileImage(adminProfilePic);
      setProfileImage(profileImagePreview);
      
      currentEmail.value = adminData.email;

      // Hide loading screen
      loadingOverlay.classList.add("hidden");
    } catch (error) {
      console.error('Error initializing page:', error);
      loadingOverlay.classList.add('error');
      loadingOverlay.innerHTML = `
        <div class="loading-container">
          <div class="loading-text">
            <span class="brand">Error</span>
            <span class="subtitle">Failed to load dashboard</span>
          </div>
          <div class="loading-message">
            <i class="fas fa-exclamation-circle"></i>
            <span>${error.message || 'An unexpected error occurred'}</span>
          </div>
          <button onclick="window.location.reload()">
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>
      `;
      
      if (error.message === 'No user logged in' || error.message === 'No user data found') {
        window.location.href = "login.html";
      }
    }
  }

  // Get first name
  function getFirstName(name) {
    return name.split(" ")[0];
  }

  // Modal functionality
  function openPasswordModal() {
    passwordModal.style.display = "block";
    // Clear form fields when opening modal
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  }

  function closePasswordModal() {
    passwordModal.style.display = "none";
  }

  // Event Listeners
  changePasswordBtn.addEventListener("click", openPasswordModal);
  closeModalBtn.addEventListener("click", closePasswordModal);
  
  // Close modal when clicking outside
  window.addEventListener("click", function(event) {
    if (event.target === passwordModal) {
      closePasswordModal();
    }
  });

  // Handle profile image upload
  profileImage.addEventListener("change", async function(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async function(e) {
        const newImageSrc = e.target.result;
        profileImagePreview.src = newImageSrc;
        adminProfilePic.src = newImageSrc;
        
        // Update the image in Firestore
        try {
          const user = auth.currentUser;
          if (user) {
            await updateDoc(doc(db, 'users', user.uid), {
              profilePicture: newImageSrc
            });
          }
        } catch (error) {
          console.error('Error updating profile picture:', error);
          alert('Failed to update profile picture. Please try again.');
        }
      };
      reader.onerror = () => {
        profileImagePreview.src = 'https://i.ibb.co/277hTSg8/generic-profile.jpg';
        adminProfilePic.src = 'https://i.ibb.co/277hTSg8/generic-profile.jpg';
      };
      reader.readAsDataURL(file);
    }
  });

  // Handle password form submission
  document.getElementById("passwordForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    const currentPasswordValue = currentPassword.value;
    const newPasswordValue = newPassword.value;
    const confirmPasswordValue = confirmPassword.value;

    if (newPasswordValue !== confirmPasswordValue) {
      alert("New passwords do not match!");
      return;
    }

    const user = auth.currentUser;
    if (user && user.email) {
      try {
        // Re-authenticate admin
        const credential = EmailAuthProvider.credential(user.email, currentPasswordValue);
        await reauthenticateWithCredential(user, credential);

        // Update password
        await updatePassword(user, newPasswordValue);

        alert("Password updated successfully! Please log in again.");
        await auth.signOut();
        window.location.href = "./login.html";
      } catch (error) {
        console.error("Error updating password:", error);
        alert("Error: " + error.message);
      }
    } else {
      alert("No admin user is currently logged in.");
    }
  });

  // Handle logout
  logoutBtn.addEventListener("click", async function() {
    if (confirm("Are you sure you want to logout?")) {
      try {
        await auth.signOut();
        window.location.href = "./login.html";
      } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to logout. Please try again.');
      }
    }
  });

  // Initialize the page
  await initializePage();
});
