import cart from "./cart.js";
import fetchProducts from "./products.js";
import { auth, db } from "../../firebase/firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

let app = document.getElementById('app');
let temporaryContent = document.getElementById('temporaryContent');
let loadingOverlay = document.getElementById('loading-overlay');

// Check authentication state
const checkAuth = () => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // Stop listening to auth state changes
      if (user) {
        resolve(user);
      } else {
        // Redirect to login if not authenticated
        window.location.href = "../../pages/auth/login.html";
        reject(new Error('User not authenticated'));
      }
    });
  });
};

// Check if user has completed orders
const checkCompletedOrders = async (userId) => {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('userId', '==', userId),
      where('status', '==', 'completed')
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking completed orders:', error);
    return false;
  }
};

// Get user profile data
const getUserProfile = async (userId) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

// Handle mobile dropdown
const initMobileDropdown = () => {
  const userProfile = document.querySelector('.user-profile');
  if (!userProfile) return;

  // Toggle dropdown on click for mobile
  userProfile.addEventListener('click', (e) => {
    if (window.innerWidth <= 767) {
      e.preventDefault();
      userProfile.classList.toggle('active');
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 767 && 
        userProfile.classList.contains('active') && 
        !userProfile.contains(e.target)) {
      userProfile.classList.remove('active');
    }
  });

  // Close dropdown when clicking a link
  const dropdownLinks = userProfile.querySelectorAll('.profile-dropdown a');
  dropdownLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 767) {
        userProfile.classList.remove('active');
      }
    });
  });
};

// load template file
const loadTemplate = async () => {
  try {
    // Check authentication first
    const user = await checkAuth();
    console.log('Authenticated user:', user);

    // Get user profile data
    const userData = await getUserProfile(user.uid);
    
    // Check for completed orders
    const hasCompletedOrders = await checkCompletedOrders(user.uid);

    const response = await fetch('../../../src/pages/shopping/template.html');
    const html = await response.text();
    
    app.innerHTML = html;
    let contentTab = document.getElementById('contentTab');
    contentTab.innerHTML = temporaryContent.innerHTML;
    temporaryContent.innerHTML = null;
    
    // Update profile image
    const profileImg = document.getElementById('user-profile-img');
    if (profileImg && userData) {
      profileImg.src = userData.profilePicture || 'https://i.ibb.co/277hTSg8/generic-profile.jpg';
    }

    // Show/hide room navigation links based on completed orders
    const roomLinks = document.querySelector('.room-links');
    if (roomLinks) {
      roomLinks.style.display = hasCompletedOrders ? 'flex' : 'none';
    }
    
    // Initialize mobile dropdown
    initMobileDropdown();
    
    // Initialize cart
    await cart();
    
    // Initialize products
    await initApp();
    
    // Hide loading overlay after everything is loaded
    loadingOverlay.classList.add('hidden');
  } catch (error) {
    console.error('Error loading template:', error);
    loadingOverlay.innerHTML = `
      <div class="loading-container">
        <div class="loading-text" style="color: #ff3b30;">Error loading products</div>
        <div class="loading-message">Please try again</div>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #E8BC0E; border: none; border-radius: 5px; cursor: pointer;">
          Retry
        </button>
      </div>
    `;
  }
};

const initApp = async () => {
  // load list product
  let listProduct = document.querySelector('.listProduct');
  listProduct.innerHTML = null;

  try {
    // Wait for products to be loaded
    const products = await fetchProducts();
    
    products.forEach(product => {
      let newProduct = document.createElement('div');
      newProduct.classList.add('item');
      newProduct.innerHTML = `
        <div class="item-content" onclick="window.location.href='../shopping/detail.html?id=${product.id}'">
          <div class="image-wrapper">
            <img 
              src="${product.image}" 
              alt="${product.name}"
              loading="lazy"
              onerror="this.onerror=null; this.src='https://i.ibb.co/277hTSg8/generic-profile.jpg';"
              style="opacity:0; transition: opacity 0.3s;"
              onload="this.style.opacity=1"
            />
            <div class="img-placeholder"></div>
          </div>
          <h2>${product.name}</h2>
          <div class="price">$${product.price}</div>
        </div>
        <button class="addCart" data-id="${product.id}">
          Add To Cart
        </button>
      `;
      listProduct.appendChild(newProduct);
    });
  } catch (error) {
    console.error('Error loading products:', error);
    listProduct.innerHTML = `
      <div style="text-align: center; color: #fff; padding: 20px;">
        <p>Error loading products. Please try again.</p>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #E8BC0E; border: none; border-radius: 5px; cursor: pointer;">
          Retry
        </button>
      </div>
    `;
  }
};

// Start loading process
loadTemplate();
