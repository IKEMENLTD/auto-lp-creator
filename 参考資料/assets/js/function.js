/* =========================================================
js-arealink
========================================================= */
$(document).ready(function () {
  $(".js-arealink").mouseover(function () {
    $(this).css("cursor", "pointer");
  });
  $(".js-arealink").click(function () {
    if ($(this).find("a").attr("target") == "_blank") {
      window.open($(this).find("a").attr("href"), '_blank');
    } else {
      window.location = $(this).find("a").attr("href");
    }
    return false;
  });
});
/* =========================================================
matchHeight
========================================================= */
$(function() {
    $('.sec_dl .case-content h3').matchHeight();
    $('.sec_dl .case-content p').matchHeight();
    $('.sec-download .blog-content h3').matchHeight();
});
/* =========================================================
ページ内リンクでハンバーガーメニューを閉じる
========================================================= */
function toggleNavbarClass() {
  if ($(window).width() <= 767) {
    $('.navbar-nav').addClass('navbar-nav-sp');
  } else {
    $('.navbar-nav').removeClass('navbar-nav-sp');
  }
}

$(window).on('load resize', toggleNavbarClass);

$(document).on('click', '.navbar-nav-sp a[href*="#"]', function() {
  $('.navbar-nav-sp').css('display', 'none');
});

