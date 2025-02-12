import $ from "https://cdn.jsdelivr.net/npm/jquery@latest/+esm";
function typeOnchange() {
    
}
function OSOnchange() {
    if (document.getElementById('OS')) {
        var id = document.getElementById('OS').value();
        if (id === "Other") {
            document.getElementById('OS-Other').style.display = "";
            $('#OtherOS').removeAttribute('disabled')
        } else {
            document.getElementById('OS-Other').style.display = "none";
            $('#OtherOS').setAttribute('disabled','')
        }
    }
}